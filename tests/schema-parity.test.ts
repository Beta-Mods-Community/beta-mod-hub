import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { is } from "drizzle-orm";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import * as core from "../db/schema";
import * as feedback from "../db/feedback-schema";
import * as community from "../db/community-schema";

// Only schema metadata is imported: no lib/db, environment files, database,
// migrations, or providers. Parse the canonical SQL instead of duplicating its
// expected types and check limits in another hand-maintained fixture.
function tokenize(source: string): string[] {
  const tokens = source.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\r\n]*|\/\*[\s\S]*?\*\/|[a-z_][a-z0-9_]*|\d+|<=|>=|<>|!=|[^\s]/gi) ?? [];
  return tokens.filter(token => !token.startsWith("--") && !token.startsWith("/*"))
    .map(token => token.startsWith("'") ? token : token.startsWith('"')
      ? token.slice(1, -1).replaceAll('""', '"') : token.toLowerCase());
}

function closingParen(tokens: string[], opening: number): number {
  assert.equal(tokens[opening], "(", "Expected a parenthesized SQL definition");
  let depth = 0;
  for (let i = opening; i < tokens.length; i++) {
    if (tokens[i] === "(") depth++;
    if (tokens[i] === ")" && --depth === 0) return i;
  }
  assert.fail("Unterminated parenthesized SQL definition");
}

function definitions(tokens: string[]): string[][] {
  const entries: string[][] = [];
  let start = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "(") i = closingParen(tokens, i);
    else if (tokens[i] === ",") {
      entries.push(tokens.slice(start, i));
      start = i + 1;
    }
  }
  entries.push(tokens.slice(start));
  return entries;
}

function normalizeType(tokens: string[]): string {
  const type = tokens.join(" ");
  return type === "timestamp with time zone" ? "timestamptz" : type;
}

type ContractTable = { columns: Record<string, string>; checks: Record<string, string[]> };

function sqlContract(source: string): Record<string, ContractTable> {
  const tokens = tokenize(source);
  const tables: Record<string, ContractTable> = {};
  const constraints = new Set(["constraint", "primary", "unique", "foreign", "check"]);
  const typeTerminators = new Set([...constraints, "not", "null", "default", "references"]);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== "create" || tokens[i + 1] !== "table") continue;
    const name = tokens[i + 2];
    const end = closingParen(tokens, i + 3);
    assert.ok(!tables[name], `Duplicate SQL table ${name}`);
    const table: ContractTable = { columns: {}, checks: {} };
    for (const entry of definitions(tokens.slice(i + 4, end))) {
      const column = constraints.has(entry[0]) ? undefined : entry[0];
      if (column) {
        const typeEnd = entry.findIndex((token, index) => index > 0 && typeTerminators.has(token));
        table.columns[column] = normalizeType(entry.slice(1, typeEnd < 0 ? undefined : typeEnd));
      }
      for (let j = 0; j < entry.length; j++) {
        if (entry[j] !== "check") continue;
        const checkEnd = closingParen(entry, j + 1);
        const explicitName = entry[j - 2] === "constraint" ? entry[j - 1] : undefined;
        // PostgreSQL assigns this name to each unnamed inline column CHECK in
        // schema.sql. Require explicit names for future table-level CHECKs.
        assert.ok(explicitName || column, `Name the table CHECK on ${name}`);
        const checkName = explicitName ?? `${name}_${column}_check`;
        assert.ok(!table.checks[checkName], `Duplicate CHECK name ${checkName}`);
        table.checks[checkName] = entry.slice(j + 2, checkEnd);
        j = checkEnd;
      }
    }
    tables[name] = table;
    i = end;
  }
  assert.ok(Object.keys(tables).length > 0, "No CREATE TABLE definitions found");
  return tables;
}

const contract = sqlContract(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
const schemaExports: unknown[] = Object.values({ ...core, ...feedback, ...community });
const models = schemaExports
  .filter((value): value is PgTable => is(value, PgTable)).map(getTableConfig);
const dialect = new PgDialect();

test("every SQL table and column has the same Drizzle SQL type", () => {
  assert.deepEqual(models.map(table => table.name).sort(), Object.keys(contract).sort());
  for (const table of models) {
    const columns = Object.fromEntries(table.columns.map(column => [column.name, normalizeType(tokenize(column.getSQLType()))]));
    assert.deepEqual(columns, contract[table.name].columns, `${table.name} column type drift`);
  }
});

test("every SQL CHECK has the same Drizzle name and expression", () => {
  for (const table of models) {
    const checks = Object.fromEntries(table.checks.map(check => {
      const query = dialect.sqlToQuery(check.value);
      assert.deepEqual(query.params, [], `${check.name} must use literal DDL values`);
      const tokens = tokenize(query.sql);
      // Drizzle qualifies its column references; canonical CREATE TABLE
      // expressions use the same identifiers without a table qualifier.
      const expression = tokens.filter((token, index) =>
        !(token === table.name && tokens[index + 1] === ".") &&
        !(token === "." && tokens[index - 1] === table.name));
      return [check.name, expression];
    }));
    assert.equal(Object.keys(checks).length, table.checks.length, `${table.name} duplicate Drizzle CHECK names`);
    assert.deepEqual(checks, contract[table.name].checks, `${table.name} CHECK constraint drift`);
  }
});
