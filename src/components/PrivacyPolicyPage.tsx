import React from 'react';
import { ArrowLeft, Mail, ShieldCheck, Trash2 } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { ThemeSelector } from './ThemeSelector';
import type { AuthModalMode } from './AuthModal';

interface PrivacyPolicyPageProps {
  onNavigateHome: () => void;
  onOpenAuth?: (mode: AuthModalMode) => void;
  isSignedIn?: boolean;
}

const SECTIONS = [
  { id: 'what-we-collect', label: 'Data Collected' },
  { id: 'why-we-collect', label: 'How We Use It' },
  { id: 'who-we-share-with', label: 'Sharing & AI' },
  { id: 'retention', label: 'Retention' },
  { id: 'how-to-delete', label: 'Deletion Rights' },
  { id: 'contact', label: 'Contact' },
];

export function PrivacyPolicyPage({
  onNavigateHome,
  onOpenAuth,
  isSignedIn = false,
}: PrivacyPolicyPageProps) {
  const handleHomeClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigateHome();
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-slate-50 text-slate-900 dark:bg-[#080F1E] dark:text-slate-100">
      {/* 3-Zone Header Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-slate-800/80 dark:bg-[#080F1E]/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6 lg:px-8">
          <a
            href="/"
            onClick={handleHomeClick}
            className="shrink-0 whitespace-nowrap rounded-lg focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <BrandLogo size="md" />
          </a>

          <nav
            aria-label="Privacy policy sections"
            className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex dark:text-slate-300"
          >
            <a
              href="#what-we-collect"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-[#0F1E3D] hover:underline hover:underline-offset-4 dark:hover:text-white"
            >
              Data Collected
            </a>
            <a
              href="#why-we-collect"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-[#0F1E3D] hover:underline hover:underline-offset-4 dark:hover:text-white"
            >
              Purpose
            </a>
            <a
              href="#who-we-share-with"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-[#0F1E3D] hover:underline hover:underline-offset-4 dark:hover:text-white"
            >
              Third-Party Services
            </a>
            <a
              href="#how-to-delete"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-[#0F1E3D] hover:underline hover:underline-offset-4 dark:hover:text-white"
            >
              Deletion
            </a>
            <a
              href="#contact"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-[#0F1E3D] hover:underline hover:underline-offset-4 dark:hover:text-white"
            >
              Contact
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href="/"
              onClick={handleHomeClick}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#0F1E3D] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] whitespace-nowrap shrink-0 dark:bg-[#1D4ED8] dark:hover:bg-blue-500"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{isSignedIn ? 'Workspace' : 'Home'}</span>
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        {/* Document Header */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 dark:border-slate-800 dark:bg-[#0D162B]">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 select-none dark:text-slate-400">
            <span className="font-semibold text-[#1D4ED8] dark:text-[#38BDF8]">Brainstine Legal &amp; Trust</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">Last Updated: 20 November 2026</span>
          </div>

          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#0B1528] text-balance sm:text-4xl dark:text-white academic-selectable">
            Privacy Policy for Brainstine
          </h1>

          <p className="mt-4 text-base leading-relaxed text-slate-600 dark:text-slate-300 academic-selectable">
            Brainstine (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) operates an AI-powered academic study
            workspace designed to help students organize course materials, generate structured study summaries, practice
            with quizzes and timed examinations, and study with an Academic Chatbot and Personal AI Tutor. This Privacy
            Policy explains clearly what personal and study information we collect, why we collect it, how it is processed
            with Supabase, Groq, the Google Gemini API, and transactional email delivery, how long we retain it, and how
            you can delete your records or your entire account at any time.
          </p>

          {/* Quick Section Jump Links */}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-200 pt-5 select-none dark:border-slate-800">
            {SECTIONS.map((sec) => (
              <a
                key={sec.id}
                href={`#${sec.id}`}
                className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50/70 hover:text-[#0F1E3D] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-600 dark:hover:bg-slate-800"
              >
                {sec.label}
              </a>
            ))}
          </div>
        </section>

        {/* Detailed Privacy Policy Content */}
        <article className="mt-8 space-y-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 dark:border-slate-800 dark:bg-[#0D162B] academic-selectable">
          {/* Section 1: What we collect */}
          <section id="what-we-collect" className="scroll-mt-24">
            <p className="font-mono text-xs font-semibold text-[#1D4ED8] select-none dark:text-[#38BDF8]">
              Section 01
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
              What Information We Collect
            </h2>
            <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300">
              We collect only the information required to create your Brainstine account, process the study materials you
              explicitly submit, and maintain your personal academic records across sessions:
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/50">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Account &amp; Google Sign-In Details
                </h3>
                <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  <li>Your full name or chosen display name.</li>
                  <li>Your email address or phone number used to sign in and verify your account.</li>
                  <li>Your Google profile photo (avatar image URL) when you choose to sign in with Google OAuth.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/50">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Uploaded Notes, Documents &amp; Photos
                </h3>
                <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  <li>
                    Images and camera snapshots you upload, including handwritten notebook pages, textbook pages, and
                    diagrams in <strong>JPG</strong>, <strong>PNG</strong>, and <strong>WEBP</strong> formats.
                  </li>
                  <li>
                    PDF documents, lecture audio recordings, and study notes or text excerpts that you upload or paste
                    into the workspace.
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/50">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Summaries &amp; Assessment Records
                </h3>
                <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  <li>Study summaries, structured chapter notes, definitions, and diagrams you create and save.</li>
                  <li>Generated quizzes, your submitted quiz and exam answers, grading feedback, and test scores.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/50">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  AI Conversations &amp; Academic History
                </h3>
                <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  <li>Messages, follow-up questions, and lesson progress in the Personal AI Tutor and AI Academic Chatbot.</li>
                  <li>
                    Your <strong>My Academic History</strong> timeline linking your saved summaries, quizzes, exams,
                    chats, and performance statistics.
                  </li>
                </ul>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Brainstine also stores essential browser preferences locally (such as your Light, Dark, or System display
              theme choice and your authenticated session token) strictly to keep the application working reliably. We do
              not run third-party advertising trackers or cross-site behavioral tracking cookies.
            </p>
          </section>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* Section 2: Why we collect it */}
          <section id="why-we-collect" className="scroll-mt-24">
            <p className="font-mono text-xs font-semibold text-[#1D4ED8] select-none dark:text-[#38BDF8]">
              Section 02
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
              Why We Collect and Use Your Information
            </h2>
            <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300">
              Every category of data collected by Brainstine serves a direct, core learning feature requested by you:
            </p>
            <ul className="mt-4 space-y-3 text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-300">
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">
                  Authentication &amp; Personal Workspace:
                </strong>{' '}
                We use your name, email address, and Google profile photo to sign you into your account securely,
                display your student profile, and isolate your private materials from every other user.
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">
                  Document Summarizer:
                </strong>{' '}
                We process your uploaded notes, PDFs, audio transcripts, and JPG, PNG, or WEBP photos to generate
                structured document summaries, definitions, formulas, and study notes that you can reopen anytime.
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">
                  Practice &amp; Exam Mode Quizzes:
                </strong>{' '}
                We use your selected materials and submitted quiz answers to generate multiple-choice and theory
                assessments, calculate scores, provide explanations, and display Practice and Exam Mode results.
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">
                  Personal AI Tutor &amp; Academic Chatbot:
                </strong>{' '}
                We process your messages, attached materials, and uploaded study photos to provide accurate, step-by-step
                AI Tutor guidance and Academic Chatbot answers with persistent conversation history.
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">
                  My Academic History:
                </strong>{' '}
                We organize your saved summaries, quiz attempts, exam results, and AI Tutor/Chat sessions in My Academic
                History so you can search, revisit, rename, or continue past study sessions across devices.
              </li>
            </ul>

            <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1D4ED8] dark:text-[#38BDF8]" aria-hidden="true" />
                <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                  <strong className="font-semibold text-slate-900 dark:text-white">
                    Google API Services User Data Policy Compliance:
                  </strong>{' '}
                  Brainstine&rsquo;s use and transfer to any other app of information received from Google APIs strictly
                  adheres to the Google API Services User Data Policy, including the Limited Use requirements. Basic
                  Google Sign-In profile information (name, email address, and profile photo) is used solely to
                  authenticate your Brainstine account and personalize your student workspace.
                </div>
              </div>
            </div>
          </section>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* Section 3: Who we share with */}
          <section id="who-we-share-with" className="scroll-mt-24">
            <p className="font-mono text-xs font-semibold text-[#1D4ED8] select-none dark:text-[#38BDF8]">
              Section 03
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
              Who We Share Your Data With
            </h2>
            <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300">
              We share data only with the essential infrastructure and AI service providers required to run Brainstine:
            </p>

            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/50">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Supabase (Authentication, Database &amp; Private File Storage)
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  We use Supabase to authenticate users securely and store your profile information, private uploaded
                  files, saved summaries, quiz attempts, AI Tutor messages, and Academic History. Access to your database
                  rows and private storage buckets is protected by Supabase authentication and per-user Row-Level
                  Security policies.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/50">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Google Gemini API &amp; Groq (AI Processing)
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  When you click summarize, generate a quiz, submit questions, or send a message/photo
                  to the Academic Chatbot or Personal AI Tutor, Brainstine transmits the relevant study text, image, or
                  prompt from our server to our configured AI inference providers (Groq and Google Gemini API) solely to
                  generate your requested educational response.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/50">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Resend (Transactional Welcome &amp; Account Emails)
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  When you register a new account that includes a verified email address, Brainstine sends a one-time
                  welcome email via Resend using only your display name and email address. Phone-only registrations without
                  an email address do not trigger welcome emails.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-100/80 p-5 dark:border-slate-700 dark:bg-slate-900/80">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Strict Commitments Against Data Selling &amp; Advertising
              </h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                <li>
                  <strong>We do NOT sell personal data to anyone.</strong>
                </li>
                <li>
                  <strong>We do NOT share data with advertisers, ad networks, or data brokers.</strong>
                </li>
                <li>
                  We only disclose data outside our infrastructure, AI inference, and email delivery providers if
                  legally required to comply with valid applicable law or to protect the safety and security of users
                  and our platform.
                </li>
              </ul>
            </div>
          </section>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* Section 4: How long we keep it */}
          <section id="retention" className="scroll-mt-24">
            <p className="font-mono text-xs font-semibold text-[#1D4ED8] select-none dark:text-[#38BDF8]">
              Section 04
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
              How Long We Keep Your Data
            </h2>
            <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300">
              We retain your account profile, uploaded materials, saved summaries, quiz attempts, AI Tutor messages, and
              My Academic History only for as long as your Brainstine account remains active, until you delete specific
              records inside <strong>My Academic History</strong> (or your Uploaded Materials and Saved Summaries views),
              or until you request complete deletion of your account.
            </p>
            <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300">
              When you delete a summary, uploaded study file, quiz attempt, or AI conversation session in the app, it is
              removed directly from active Supabase tables and storage buckets. Temporary server memory used while
              streaming AI responses or extracting text from uploaded files is discarded after the request completes.
            </p>
          </section>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* Section 5: How to delete */}
          <section id="how-to-delete" className="scroll-mt-24">
            <p className="font-mono text-xs font-semibold text-[#1D4ED8] select-none dark:text-[#38BDF8]">
              Section 05
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
              How to Delete Your Data or Account
            </h2>
            <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300">
              You remain in full control of your academic workspace and can delete your data in two straightforward ways:
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <Trash2 className="h-4 w-4 text-[#1D4ED8] dark:text-[#38BDF8]" aria-hidden="true" />
                  <h3 className="font-display text-base font-semibold">1. Delete Items Inside the App</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  Signed-in users can permanently delete individual saved summaries, uploaded PDF/image/audio files,
                  quiz attempts, AI Academic Chatbot threads, and Personal AI Tutor sessions at any time inside{' '}
                  <strong>My Academic History</strong>, <strong>Saved Summaries</strong>, and{' '}
                  <strong>Uploaded Materials</strong>.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <Mail className="h-4 w-4 text-[#1D4ED8] dark:text-[#38BDF8]" aria-hidden="true" />
                  <h3 className="font-display text-base font-semibold">2. Delete Your Entire Account</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  To delete your entire Brainstine account and all stored profile details, uploaded materials, summaries,
                  quizzes, AI Tutor messages, and Academic History permanently, send an email to{' '}
                  <a
                    href="mailto:support@brainstine.com?subject=Account%20Deletion%20Request%20-%20Brainstine"
                    className="font-semibold text-[#1D4ED8] underline underline-offset-4 dark:text-[#38BDF8]"
                  >
                    support@brainstine.com
                  </a>{' '}
                  from your registered email address. We process verified account deletion requests promptly.
                </p>
              </div>
            </div>
          </section>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* Section 6: Security & Children & Policy Updates */}
          <section id="security-and-updates" className="scroll-mt-24 space-y-5">
            <div>
              <p className="font-mono text-xs font-semibold text-[#1D4ED8] select-none dark:text-[#38BDF8]">
                Section 06
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
                Security, Eligibility &amp; Policy Updates
              </h2>
            </div>

            <div className="space-y-3 text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300">
              <p>
                <strong className="font-semibold text-slate-900 dark:text-white">Security Safeguards:</strong> All web
                traffic between your browser, Brainstine&rsquo;s backend server, Supabase, and the Google Gemini API is
                encrypted in transit using HTTPS/TLS. Private files you upload are stored in authenticated user-scoped
                storage folders accessed via short-lived signed URLs, and API credentials for AI processing are kept
                strictly on the server.
              </p>
              <p>
                <strong className="font-semibold text-slate-900 dark:text-white">Children&rsquo;s Privacy:</strong>{' '}
                Brainstine is intended for secondary, university, and adult learners (or younger students using the
                platform with parent, guardian, or educator supervision where permitted by local law). If you believe a
                child provided personal information without appropriate consent, please email{' '}
                <a
                  href="mailto:support@brainstine.com"
                  className="font-semibold text-[#1D4ED8] underline underline-offset-4 dark:text-[#38BDF8]"
                >
                  support@brainstine.com
                </a>{' '}
                so we can remove it immediately.
              </p>
              <p>
                <strong className="font-semibold text-slate-900 dark:text-white">Changes to This Policy:</strong> If we
                make material updates to how Brainstine handles personal data, we will revise the &ldquo;Last
                Updated&rdquo; date at the top of this page and publish the updated Privacy Policy at{' '}
                <span className="font-mono text-xs">/privacy</span>.
              </p>
            </div>
          </section>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* Section 7: Contact Us */}
          <section id="contact" className="scroll-mt-24">
            <p className="font-mono text-xs font-semibold text-[#1D4ED8] select-none dark:text-[#38BDF8]">
              Section 07
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
              Contact Us
            </h2>
            <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300">
              If you have any questions about this Privacy Policy, how Brainstine protects your study materials, or how
              to access, export, or delete your account data, please contact us directly:
            </p>

            <div className="mt-5 flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/80 p-5 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900/60">
              <div>
                <p className="text-xs font-semibold text-slate-500 select-none dark:text-slate-400">
                  Brainstine Privacy &amp; Support Email
                </p>
                <a
                  href="mailto:support@brainstine.com"
                  className="mt-1 inline-block font-display text-lg font-bold text-[#0F1E3D] underline underline-offset-4 hover:text-[#1D4ED8] dark:text-white dark:hover:text-[#38BDF8]"
                >
                  support@brainstine.com
                </a>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Use this address for privacy questions, data requests, or complete account deletion.
                </p>
              </div>

              {onOpenAuth && !isSignedIn && (
                <button
                  type="button"
                  onClick={() => onOpenAuth('signup')}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0F1E3D] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] whitespace-nowrap shrink-0 select-none dark:bg-[#1D4ED8] dark:hover:bg-blue-500"
                >
                  Get Started with Brainstine
                </button>
              )}
            </div>
          </section>
        </article>
      </main>

      <footer className="border-t border-slate-200 bg-white py-8 dark:border-slate-800 dark:bg-[#080F1E]">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1">
            <a
              href="/"
              onClick={handleHomeClick}
              className="w-fit rounded-lg focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <BrandLogo size="sm" />
            </a>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Privacy Policy · Last Updated: 20 November 2026 · Contact: support@brainstine.com
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="/"
              onClick={handleHomeClick}
              className="text-xs font-semibold text-slate-700 underline-offset-4 hover:text-[#0F1E3D] hover:underline dark:text-slate-300 dark:hover:text-white"
            >
              Back to Home
            </a>
            <ThemeSelector />
          </div>
        </div>
      </footer>
    </div>
  );
}
