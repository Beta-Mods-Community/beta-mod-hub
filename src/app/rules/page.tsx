import Link from "next/link";
export const metadata = { title: "Site rules" };
export default function RulesPage() {
  return <main className="site-container w-full max-w-3xl flex-1 py-12"><h1 className="text-3xl font-semibold">Site rules</h1>
    <div className="panel mt-6 space-y-5 p-6 text-sm leading-7">
      <p>Beta Mods hosts work-in-progress game mods for testing. Uploaded builds may be unstable. Read installation instructions, back up saves, and test on a separate profile where possible.</p>
      <ul className="list-disc space-y-3 pl-5">
        <li>Upload only files and images you created or have permission to share. Credit dependencies and other contributors.</li>
        <li>Do not upload malware, stolen content, private information, or files designed to harm other users.</li>
        <li>Describe your mod accurately. Document requirements and known problems.</li>
        <li>Report bugs with the build version and steps to reproduce them. Do not harass authors or testers.</li>
        <li>Vote only on builds you have actually tested. Do not manipulate votes or testing history.</li>
        <li>Keep a copy of your work. During the pilot, storage and account access are limited and availability may change.</li>
      </ul>
      <p>The administrator can hide listings and suspend accounts to address abuse or investigate reports. Malware scanning does not guarantee that a mod is safe or compatible with your setup.</p>
      <p>Beta Mods is independent of Nexus Mods. Publishing on Nexus is a separate step subject to its requirements.</p>
      <Link href="/contact" className="text-[var(--accent)] underline">Contact the administrator</Link>
    </div>
  </main>;
}
