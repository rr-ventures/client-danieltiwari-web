/* ============================================================
   Dan, post-quiz nurture sequence (content + render)
   Source copy (Dan's voice, v1 draft, pending Dan's voice pass):
   vault .../dan-resend-nurture-build/dan-nurture-sequence-copy.md
     Branch A, diagnostic / high-fit · 6 emails / 12 days
     Branch B, nurture / everyone else · 7 emails / 21 days
   Merge fields: {{first_name}} {{top_focus_area}} {{authenticity_stage}}
   Tokens:  [MAP]  -> link to the hosted Authenticity Map (A1/B1 only)
            [BOOK] -> booking link (Calendly placeholder for now)
   Email 1 (A1/B1, day 0) is the result-link email, sent instantly.
   ============================================================ */

// Each email: { day, subject, preview, body }. body = array of paragraphs.
const BRANCH_A = [
  { day: 0, subject: "Your snapshot, {{first_name}}, and the pattern underneath it",
    preview: "One honest look. Then a quiet couple of weeks.",
    body: [
      "{{first_name}},",
      "You just did something most people avoid for years. You looked.",
      "Your snapshot puts you around **{{authenticity_stage}}**, and the area asking loudest for your attention is **{{top_focus_area}}**. Notice it probably isn't really about {{top_focus_area}} itself. It rarely is. That area is just where the deeper thing surfaces first.",
      "[MAP]",
      "Sit with the result for a day. Don't fix anything yet.",
      "Over the next couple of weeks I'll send a few short notes, not a campaign, just the thinking that tends to help people standing where you are. At the end, if it feels right, there's a quiet door you can walk through.",
      "For now: which line in your result was hardest to read? Reply and tell me. I read these myself.",
      ",  Daniel",
    ] },
  { day: 1, subject: "I almost didn't write this one",
    preview: "Where the borrowed life came from, in my case.",
    body: [
      "{{first_name}},",
      "For most of my twenties I was certain that if I just performed a little harder, the life I'd built would finally start to feel like mine.",
      "It never did. Not because I lacked discipline. Because I was running someone else's definition of a good life and calling it my own.",
      "The cost wasn't dramatic. It was quiet. Years that looked fine from the outside and felt hollow from the inside.",
      "What changed it wasn't a new strategy. It was getting honest about which parts of my life I'd never actually chosen.",
      "That's the work I do now. Not motivation. Not hacks. Just the slow, clarifying business of finding out what's actually yours.",
      "More soon.",
      ",  Daniel",
    ] },
  { day: 3, subject: "The thing more discipline won't fix",
    preview: "Why capable people stay quietly stuck.",
    body: [
      "{{first_name}},",
      "Here's what I notice in people who land where you did on the assessment.",
      "You're not short on capability. You can grit your teeth and force almost anything. That's exactly the trap. The harder you can push, the longer you can keep a misaligned life running before it breaks.",
      "At **{{authenticity_stage}}**, the work usually isn't another push. It's removing the interference, the inherited expectations, the borrowed definition of success, the parts you've never let yourself question.",
      "That's hard to do alone, because the thing in the way is usually invisible to the person carrying it.",
      "If you'd like an outside look at yours, this is the door I mentioned. A private conversation, thirty minutes, no pitch, a continuation of the assessment you already started.",
      "[BOOK]",
      ",  Daniel",
    ] },
  { day: 5, subject: "What changes when the real thing gets named",
    preview: "A short story about someone who looked successful.",
    body: [
      "{{first_name}},",
      "Someone I worked with had everything on paper, the business, the relationship, the freedom most people are still chasing. And a persistent sense that none of it was his.",
      "We didn't add anything. We took things away. The shoulds. The version of himself he'd been performing since he was nineteen.",
      "What surprised him wasn't the clarity. It was the relief. How much energy he'd been spending holding up a life he didn't actually want.",
      "I'm not promising you his outcome, your pattern is your own. But the mechanism is the same: name what isn't yours, and a lot of the struggle stops being necessary.",
      "If you want to look at yours together, the door's still open.",
      "[BOOK]",
      ",  Daniel",
    ] },
  { day: 8, subject: "Why most coaching doesn't work",
    preview: "And what I do differently.",
    body: [
      "{{first_name}},",
      "Most coaching solves the wrong layer.",
      "It works on motivation, strategy, productivity, the surface. Useful, sometimes. But if the life underneath is borrowed, a better strategy just helps you climb the wrong mountain faster.",
      "I work one layer down: identity. Who you've been performing, and who's underneath it. It's slower, more honest, and far more demanding than a typical coaching relationship.",
      "It's also why I take on only a handful of people at a time, over six months, one to one. This isn't a programme. It's a private relationship with your actual life as the subject.",
      "If that's the kind of work you're looking for, let's talk.",
      "[BOOK]",
      ",  Daniel",
    ] },
  { day: 12, subject: "Before this thread goes quiet",
    preview: "No pressure either way.",
    body: [
      "{{first_name}},",
      "This is the last of these notes.",
      "If you've been meaning to book the conversation, here's the link one more time. If you haven't, that's genuine information too, maybe the timing's wrong, maybe the fit isn't there. Both are fine.",
      "I keep the number of people I work with deliberately small, not as a tactic, but because this work doesn't scale without losing what makes it work.",
      "Either way, I'll keep writing occasionally, the kind of thinking that helped you take the assessment in the first place. Stay if it's useful.",
      "And if you ever want to look at what's standing in front of your potential, you know where I am.",
      "[BOOK]",
      ",  Daniel",
    ] },
];

const BRANCH_B = [
  { day: 0, subject: "Your snapshot, {{first_name}}, read this part first",
    preview: "Where you are isn't where you'll stay.",
    body: [
      "{{first_name}},",
      "Your snapshot puts you around **{{authenticity_stage}}**, with **{{top_focus_area}}** asking loudest for your attention.",
      "[MAP]",
      "Read this part first: wherever you landed is a location on a map, not a verdict. Most people spend years at the earlier stages without ever naming them. You just named yours. That's the part that matters.",
      "I'll send you a few short notes over the coming weeks, useful on their own, no strings.",
      "To start: what surprised you most in your result? Reply and tell me. I read every one.",
      ",  Daniel",
    ] },
  { day: 3, subject: "The mistake most people make at {{authenticity_stage}}",
    preview: "And the quieter move that actually works.",
    body: [
      "{{first_name}},",
      "When people start sensing that something's off, the instinct is to think their way out of it. More books. More frameworks. More analysis.",
      "Understandable, and usually the wrong move. You can't out-think a life you haven't been honest about. Insight isn't the bottleneck. Honesty is.",
      "The quieter move is to stop asking \"what should I do?\" and start asking \"what here was never actually mine to begin with?\"",
      "That single question tends to do more than a year of strategising.",
      "Sit with it this week. No need to act on it yet.",
      ",  Daniel",
    ] },
  { day: 6, subject: "One thing to try this week",
    preview: "Small, real, tied to your result.",
    body: [
      "{{first_name}},",
      "Your result flagged **{{top_focus_area}}** as the area asking loudest right now. Here's a small experiment.",
      "For one week, every time you make a decision in that area, pause and ask: am I choosing this, or performing it? Choosing it means it would still feel right with nobody watching. Performing it means it's for an audience, even an imagined one.",
      "Don't try to change anything. Just notice the ratio.",
      "Most people are startled by how much of their life turns out to be performance. That noticing is the first honest step.",
      "Tell me what you find, if you like. Reply anytime.",
      ",  Daniel",
    ] },
  { day: 9, subject: "What I wish I'd known at your stage",
    preview: "The cost of staying asleep to it.",
    body: [
      "{{first_name}},",
      "What I wish someone had told me earlier: the discomfort you feel isn't a malfunction. It's the most honest part of you, trying to get your attention.",
      "For years I treated that signal as weakness, something to push through. So I pushed, and built more of a life that wasn't mine, and wondered why the ache didn't go.",
      "The ache was the point. It was the only part of me still telling the truth.",
      "If something in you has been quietly insisting that this isn't it, that's not you being ungrateful or unfocused. That's the part worth listening to.",
      ",  Daniel",
    ] },
  { day: 13, subject: "Why I only work with a handful of people",
    preview: "What the private work actually is.",
    body: [
      "{{first_name}},",
      "I should tell you what I actually do, in case it's ever relevant.",
      "I take on a small number of people, one to one, over six months. It isn't a course or a programme. It's a private relationship with your real life as the subject, direct, demanding, and honest in a way most of us rarely get with anyone.",
      "I keep it small because this work doesn't scale without losing what makes it work.",
      "I'm not pitching you. You may be years from this, or it may never be your path, and both are fine. I just don't want it to be a mystery if the moment ever comes.",
      "If you're ever curious, just reply.",
      ",  Daniel",
    ] },
  { day: 17, subject: "How someone like you started moving",
    preview: "A short story, and a door if you want it.",
    body: [
      "{{first_name}},",
      "Someone who took this same assessment landed almost exactly where you did, capable, accomplished, and quietly certain something was off.",
      "Nothing in his life was broken. That was the hard part. There was no obvious problem to point to, just a life that fit like a borrowed coat.",
      "What moved him wasn't a breakthrough. It was permission, to admit the coat was borrowed, and to start, slowly, building one that fit.",
      "If you've read this far through these notes, some part of you is probably ready to do the same.",
      "When you want an outside look at your own pattern, there's a private conversation waiting. No pressure, no pitch.",
      "[BOOK]",
      ",  Daniel",
    ] },
  { day: 21, subject: "Where this goes next",
    preview: "The door stays open.",
    body: [
      "{{first_name}},",
      "This is the last of the welcome notes, but not the last you'll hear from me. I'll keep writing occasionally: the kind of thinking that helped you take the assessment in the first place. Stay as long as it's useful.",
      "Two things before I go quiet for a while.",
      "One: wherever you are with **{{top_focus_area}}**, the most honest move is usually the smallest one you've been avoiding. Start there.",
      "Two: if you'd ever like a clearer reflection than you can get on your own, the door's open. A private conversation, whenever the timing's right, not before.",
      "Glad you're here, {{first_name}}.",
      "[BOOK]",
      ",  Daniel",
    ] },
];

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// **bold** -> <strong>, applied AFTER escaping.
function inlineFormat(text) {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function fillMerge(text, fields) {
  return text
    .replaceAll("{{first_name}}", fields.first_name || "there")
    .replaceAll("{{top_focus_area}}", fields.top_focus_area || "the area you flagged")
    .replaceAll("{{authenticity_stage}}", fields.authenticity_stage || "where you are");
}

// Render one email's body paragraphs into light, text-forward HTML.
function renderBody(paragraphs, fields) {
  const linkStyle = "color:#15140f;border-bottom:1px solid #15140f;text-decoration:none;";
  const blocks = paragraphs.map((raw) => {
    if (raw === "[MAP]") {
      if (!fields.map_url) return "";
      return `<p style="margin:1.3rem 0;"><a href="${escapeHtml(fields.map_url)}" style="font-size:1.05rem;${linkStyle}">Open your Authenticity Map &rarr;</a></p>`;
    }
    if (raw === "[BOOK]") {
      return `<p style="margin:1.3rem 0;"><a href="${escapeHtml(fields.book_url)}" style="font-size:1.05rem;${linkStyle}">Book a private conversation &rarr;</a></p>`;
    }
    const filled = inlineFormat(escapeHtml(fillMerge(raw, fields)));
    return `<p style="margin:0 0 1rem;">${filled}</p>`;
  });
  return `<div style="font-family:Georgia,serif;color:#15140f;line-height:1.65;font-size:16px;max-width:32rem;">${blocks.join("")}</div>`;
}

// Build the full set of emails for an audience, with merge fields resolved.
// Returns [{ day, subject, html }] for the requested branch.
function buildBranch(route, fields) {
  const branch = route === "diagnostic" ? BRANCH_A : BRANCH_B;
  return branch.map((email) => ({
    day: email.day,
    subject: fillMerge(email.subject, fields),
    preview: fillMerge(email.preview, fields),
    html: renderBody(email.body, fields),
  }));
}

module.exports = { BRANCH_A, BRANCH_B, buildBranch };
