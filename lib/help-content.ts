export type HelpGuideSlug = "testing" | "authors" | "releasing";

export type HelpSection = {
  id: string;
  title: string;
  paragraphs?: readonly string[];
  steps?: readonly string[];
  bullets?: readonly string[];
};

export type HelpGuide = {
  slug: HelpGuideSlug;
  title: string;
  description: string;
  sections: readonly HelpSection[];
};

export type HelpFaq = {
  id: string;
  question: string;
  answer: string;
};

export type HelpTemplate = {
  id: "testing-brief" | "known-issues";
  title: string;
  description: string;
  markdown: string;
};

// Public product guidance only. Keep runtime access checks and limits in their
// existing policy modules, not in this content or the pages that display it.
export const helpGuides: readonly HelpGuide[] = [
  {
    slug: "testing",
    title: "Test a beta mod",
    description: "Choose a build, give useful feedback, and check whether a fix worked.",
    sections: [
      {
        id: "before-you-test",
        title: "Before you test",
        paragraphs: [
          "Beta builds can be unstable. Read the author's installation instructions, requirements, known issues, and testing goals. Back up your saves and use a separate test profile where possible. A passed malware scan does not guarantee safety or compatibility.",
        ],
        steps: [
          "Check that the mod supports your game version and setup. If the requirements are unclear, do not assume compatibility.",
          "Download the build you want to test and note its version label. Older builds remain in Test builds, but readiness voting is for the latest build.",
          "Sign in and verify your email before submitting a report or vote. You do not need upload approval to send a text-only report or vote.",
        ],
      },
      {
        id: "report-a-problem",
        title: "Report a problem someone can reproduce",
        paragraphs: [
          "Check existing Bug reports first. When you file a report, select the affected build and severity, describe what happened, and explain how to reproduce it.",
        ],
        bullets: [
          "Include the game version, relevant mods or settings, and whether you used a new or existing save.",
          "State what you expected, what happened instead, and whether it happens every time.",
          "Optional attachments are private to you and the mod author. Remove personal information first. Attachment uploads need approval and must pass scanning; a text-only report does not need a file.",
        ],
      },
      {
        id: "record-your-verdict",
        title: "Vote on the build you tested",
        paragraphs: [
          "Choose Ready or Not ready based on your testing of the latest build. A vote is not a guarantee that the mod works for everyone. If it is not ready, a bug report gives the author information a vote alone cannot provide.",
          "Each tester has one vote per build and can change that vote. Earlier votes stay in testing history but do not count toward a newer build. If a new build arrives while your page is open, test it before voting again. Authors cannot vote on their own mods.",
        ],
      },
      {
        id: "retest-a-fix",
        title: "Retest a fix",
        paragraphs: [
          "The author can respond to your report and request a retest. Marking a report fixed also requests one. Only the original reporter can record a retest on that report.",
        ],
        steps: [
          "Download the relevant build and repeat the original reproduction steps.",
          "Open your report, choose Record your retest, and select the build you actually tested.",
          "Record whether the issue is resolved or still present, with useful notes. Still present reopens the report.",
        ],
        bullets: [
          "Follow a mod for on-site notifications about new builds, reported fixes, and its Nexus release. Following does not install updates for you.",
          "The Testing checklist is only a reminder for the current page visit. Checking it does not submit a report or vote.",
        ],
      },
    ],
  },
  {
    slug: "authors",
    title: "Run a beta test",
    description: "Turn an unfinished mod into a clear testing task, then use reports to improve each build.",
    sections: [
      {
        id: "prepare-your-listing",
        title: "Give testers a clear starting point",
        paragraphs: [
          "Sign in, verify your email, and choose Post a beta. Add a title, game, status, tags, and description. You can add requirements and upload files after creating the page.",
          "Start the description with a one-sentence summary of no more than 250 characters. The release exporter uses its first nonempty line as the summary, so put the summary before a heading such as About.",
        ],
        bullets: [
          "Explain installation and removal, supported game versions, dependencies, known issues, and exactly what you want tested.",
          "Use Alpha, Beta, or Release candidate to describe the stage of your work. These are author-selected labels, not automatic quality ratings.",
          "Credit contributors and only share files or images you have permission to distribute. Keep your own copy of the project.",
        ],
      },
      {
        id: "upload-a-test-build",
        title: "Upload a version testers can identify",
        paragraphs: [
          "File uploads need separate uploader approval during the pilot. This applies to builds, screenshots, and report attachments. Creating an account or passing the site access gate does not grant that approval.",
        ],
        steps: [
          "In Test builds, choose Upload the first build or Upload a new build, give it a clear version label, and describe the changes.",
          "Choose a file that meets the limits shown on the form. Keep the page open while uploading and scanning, and do not submit it again while it is pending.",
          "After the build appears, check its version and changelog. Add requirements by name and optional Nexus URL. These dependencies are not verified automatically.",
          "Add useful screenshots, choose a cover image, and write captions that explain what testers should notice.",
        ],
      },
      {
        id: "work-through-feedback",
        title: "Work through feedback",
        paragraphs: [
          "Read reports against their affected build. Respond with the cause, workaround, or fix, then set the report to Open, Acknowledged, or Fixed. Marking it fixed requests a retest from the reporter; it does not prove the fix worked on their setup.",
          "Upload fixes as another versioned build with a changelog. Readiness votes are build-specific, so the new build needs its own testing. Only the original reporter can record a retest on their report.",
        ],
        bullets: [
          "Keep the description's known issues and testing goals current as the mod changes.",
          "Use My mods to return to your listings and their feedback. The same account can also test other authors' mods.",
        ],
      },
      {
        id: "decide-when-to-release",
        title: "Decide when to release",
        paragraphs: [
          "Review the latest build's reports, retests, and votes alongside your own checks. There is no vote threshold that certifies a mod as ready for release.",
          "When you are ready, prepare and review the release package, publish on Nexus yourself, and only then record the live Nexus URL. That confirmation closes testing and makes the beta page read-only.",
        ],
      },
    ],
  },
  {
    slug: "releasing",
    title: "Prepare a Nexus release",
    description: "Review your release files, publish on Nexus yourself, and link the finished release back to your beta.",
    sections: [
      {
        id: "review-before-export",
        title: "Review before exporting",
        paragraphs: [
          "Beta Mods prepares a package for manual publication. It does not create a Nexus page, upload to Nexus, or certify that your mod is ready. You choose when the testing is sufficient.",
        ],
        bullets: [
          "Check the latest build, unresolved reports, installation and removal instructions, compatibility notes, permissions, and credits.",
          "Update the description and requirements. Keep its first nonempty line to a useful summary of no more than 250 characters; the exporter rejects a longer summary.",
          "Check the latest changelog and gallery captions. The package includes the latest scanned build, not every earlier build.",
        ],
      },
      {
        id: "package-contents",
        title: "What the package contains",
        paragraphs: [
          "As the mod author, use Download release package in Publish on Nexus Mods. You need an uploaded build first. Open the ZIP and review the files before using them.",
        ],
        bullets: [
          "description.bbcode.txt: a best-effort conversion of your description. Review the formatting before pasting it.",
          "summary.txt: text derived from the description's first nonempty line. Copy the summary itself, not the review note beneath it.",
          "readme.txt and changelog.txt: a plain-text project description and the latest build's recorded changelog.",
          "requirements.txt: a dependency checklist for you to enter on Nexus, not an automatic import.",
          "files/: the latest scanned mod archive. The outer release-package ZIP also contains supporting text and is not a replacement for that archive.",
          "media/: scanned gallery images in order, plus captions.txt when images are present. Reports, private attachments, and votes are not included.",
        ],
      },
      {
        id: "publish-and-confirm",
        title: "Publish first, then confirm",
        steps: [
          "Create or update your Nexus mod page yourself, following its current publishing requirements. Add the reviewed description, files, images, dependencies, permissions, and credits.",
          "Check that the published page and downloads are the release you intended to share.",
          "Back on Beta Mods, enter the full live Nexus mod page URL and choose Mark as published.",
        ],
        paragraphs: [
          "Downloading the package does not change your listing's status. Mark as published closes new uploads and feedback, removes the mod from Browse, and keeps a read-only beta record with a link to the Nexus release. Confirm only after the release is live.",
        ],
      },
      {
        id: "export-limits",
        title: "If the package cannot be generated",
        paragraphs: [
          "A package can exceed the pilot's export limit even when each file fits its upload limit. The error explains which limit was reached. A short-summary error means you should edit the description's first nonempty line.",
          "Missing or unreadable stored files stop the export instead of producing an incomplete package. Read the error, keep your own source files, and contact the administrator if you cannot resolve it. Do not treat a failed download as a published release.",
        ],
      },
    ],
  },
];

export const helpFaqs: readonly HelpFaq[] = [
  {
    id: "pilot-access",
    question: "Is the pilot access code my account login?",
    answer: "No. The shared code opens the private site gate. Your personal account is separate, and you must verify your email before posting or voting. Passing the gate does not grant upload approval or access to someone else's private attachments.",
  },
  {
    id: "upload-approval",
    question: "Why can I report bugs but not upload files?",
    answer: "The pilot has a limited number of approved uploaders. Approval covers builds, screenshots, and report attachments. You can still download accessible builds, vote, and send text-only reports without it. Ask the administrator about approval; creating a listing does not reserve an uploader slot.",
  },
  {
    id: "upload-limits",
    question: "What files can I upload in the cloud pilot?",
    answer: "Builds must be ZIP files. Encrypted and nested archives are not accepted. Screenshots use PNG, JPEG, or WebP. Attachments support UTF-8 text/logs, JSON/INI, or ZIP, not binary saves. Each upload form shows its current file limits. Uploads are also subject to storage and attempt limits, so check any message before trying again.",
  },
  {
    id: "upload-wait",
    question: "My upload is taking a long time. Should I try again?",
    answer: "Keep the page open and do not resubmit while it is pending. Uploading and scanning can take several minutes. If the result could not be confirmed, check the relevant builds, screenshots, or reports in a new tab before retrying. Storage limits, attempt limits, or a scan outage can also prevent uploads; contact the administrator if you need help.",
  },
  {
    id: "attachment-privacy",
    question: "Who can see a bug report and its attachment?",
    answer: "The report text is visible to visitors who can access the mod page. Attachment downloads are limited to the reporter and mod author. In the cloud pilot, files also go to Transloadit for scanning. Remove personal information and do not upload confidential material you do not want that service to process.",
  },
  {
    id: "build-votes",
    question: "Why did my vote stop counting after an update?",
    answer: "Readiness votes belong to the build you tested. Earlier votes remain in testing history but do not approve the latest build. Download and test the new build before voting on it. Ready is feedback from a tester, not a safety guarantee or an automatic release decision.",
  },
  {
    id: "private-listings",
    question: "Can I make a mod invite-only or give it a separate code?",
    answer: "No. The pilot gate applies to the site, not to individual mods. There are no per-mod codes, unlisted listings, or private tester groups. Do not put secrets in listing text, screenshots, or bug reports.",
  },
  {
    id: "nexus-integration",
    question: "Does Beta Mods publish to Nexus or use my Nexus account?",
    answer: "No. Use an email and password for Beta Mods. Nexus sign-in and automatic publishing are not supported workflows. You review the release package, publish on Nexus yourself, and then add the live Nexus URL here. Beta Mods is independent of Nexus Mods.",
  },
  {
    id: "verification-email",
    question: "I have not received my verification email. What next?",
    answer: "Check your spam folder and that the address in Account settings is correct. Account settings lets you resend verification when email delivery is available. For a wrong address or continued delivery problems, contact the administrator. Never send your password, verification link, or reset link in a support message.",
  },
  {
    id: "where-to-get-help",
    question: "Where should I report a problem?",
    answer: "Use the mod's Bug reports section for a problem with a build. Use Report this listing for prohibited content or abuse. The Contact page is for account help, privacy requests, ownership disputes, or a problem with Beta Mods itself. Include the relevant page URL and what happened, but no passwords or private login links.",
  },
];

export const releaseChecklist: readonly string[] = [
  "I have tested the latest build and confirmed it is the version I intend to release.",
  "I have reviewed reports and retests, and documented any unresolved issues.",
  "I have checked installation, removal, game-version support, and dependencies.",
  "I have checked permissions and credits for the files and images I am sharing.",
  "I have reviewed the exported summary, description, changelog, archive, and screenshots.",
  "Before marking the beta as published, I will check the live Nexus page and its downloads.",
];

export const helpTemplates: readonly HelpTemplate[] = [
  {
    id: "testing-brief",
    title: "Testing brief",
    description: "Paste into your mod description and replace every bracketed prompt. Keep the opening summary under 250 characters.",
    markdown: `[One sentence describing what this mod changes. Keep this line under 250 characters.]

## Setup
- Game and version: [supported versions]
- Required mods or tools: [names, versions, and links]
- Installation: [steps]
- Removal or rollback: [steps and save warnings]

## What to test
- Build: [version label]
- Main change: [what is new]
- Test steps: [specific actions to try]
- Expected result: [what should happen]

## Known issues
- [Issue, affected setup, and any workaround]

## Reporting problems
Select the build you tested. Include your game version, relevant mods, reproduction steps, expected result, and actual result. Remove private information from any logs.

## Credits and permissions
[Contributors, asset sources, and permission notes]`,
  },
  {
    id: "known-issues",
    title: "Known issues",
    description: "Add this section below your description's opening summary. Replace the prompts and repeat the issue block as needed.",
    markdown: `Known issues for [mod name], build [version].

## [Short issue name]
- Affected builds: [version labels]
- Affected setup: [game version, mods, or settings]
- What happens: [observed behavior]
- Reproduction steps: [steps]
- Workaround: [steps, or no known workaround]
- Report: [link to the relevant bug report, if available]
- Next check: [what needs to be tested and on which build]

## Recently addressed
- [Issue and build containing the change; note whether the reporter has confirmed the fix]`,
  },
];
