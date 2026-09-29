import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ children }: { children: string }) {
  return <div className="markdown text-sm leading-7 text-[var(--text-soft)]">
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      img: ({ alt }) => <span className="text-[var(--muted)]">{alt ? `[Image: ${alt}]` : "[Image]"}</span>,
      a: ({ href, children }) => <a href={href} rel="nofollow noopener noreferrer" className="text-[var(--accent)] underline underline-offset-4">{children}</a>,
    }}>{children}</ReactMarkdown>
  </div>;
}
