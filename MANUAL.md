# Intern Co. — User Manual

*Last updated: 1 November 2026 · app version 0.14 · also readable in the app: ☰ Menu → About & manual*

Intern Co. gets tasks done with teams of AI agents, efficiently and without high costs. It runs on your own
Anthropic API key, billed per use in dollars, and it is built to keep usage low: lean
agent instructions, small well-scoped task cards, only the agents with work running, usage limits that pause
work, and independent checks of every result.

A **workspace** is made of **hubs** (teams). Each hub has a **manager** and **mini agents**, all of them Claude agents.
Give your agents a **goal**: the managers turn it into **task cards**, the owner approves them, and the mini agents
do the work in a folder on the computer, visible in a 3D office.

---

## Contents

1. [Getting started](#1-getting-started)
2. [The office at a glance](#2-the-office-at-a-glance)
3. [Workspaces and templates](#3-workspaces-and-templates)
4. [Giving goals](#4-giving-goals)
5. [Plans and task cards](#5-plans-and-task-cards)
6. [Following progress and results](#6-following-progress-and-results)
7. [Your Claude usage](#7-your-claude-usage)
8. [Shared files](#8-shared-files)
9. [Agent memory (hub notebooks)](#9-agent-memory-hub-notebooks)
10. [Design](#10-design)
11. [Settings reference](#11-settings-reference)
12. [Accounts and sign-in](#12-accounts-and-sign-in)
13. [Safety: what agents can and cannot do](#13-safety-what-agents-can-and-cannot-do)
14. [Where your data lives](#14-where-your-data-lives)
15. [Troubleshooting and FAQ](#15-troubleshooting-and-faq)
16. [Not built yet](#16-not-built-yet)

---

## 1. Getting started

**What you need:** Windows or a Mac, Python 3.10 or newer, the Claude Code command-line tool, your own
Anthropic API key, and the packages in `requirements.txt` (`pip install -r requirements.txt`).

**Your API key.** Create one at https://console.anthropic.com and save it on your computer as the environment
variable `ANTHROPIC_API_KEY`. The app reads it there. It does not store the key, and without one no goal can start.
Usage is billed to your Anthropic account. Keep the key private and never put it in a file you share.

- **Windows:** run `setx ANTHROPIC_API_KEY "your-key"` in a terminal once, then start the app. If the app still says
  Claude is not connected, sign out of Windows and back in.
  This saves the key for every program, so other Claude Code use on this computer is billed to the key too.
- **Mac:** run `export ANTHROPIC_API_KEY="your-key"` in Terminal, then start the app from that same Terminal window.

**Starting the app**

| How | What happens |
|---|---|
| Double-click **Intern Co.** on your desktop (Windows) | Opens the app in its own window, with no terminal. Closing the window stops it. |
| Double-click `Intern Co.bat` in the project folder (Windows) | Same as the desktop shortcut. |
| Double-click `Intern Co.command` in the project folder (Mac) | Opens the app in its own window, plus a Terminal window that shows messages and errors. Closing the app window stops it. |
| `python app/main.py` | Opens the app window and shows messages and errors in the terminal. |
| `python app/main.py --browser` | Opens it in your web browser at http://localhost:8080 instead. |
| `python app/main.py --no-browser` | Starts only the server, without opening anything. |

**First start:** the app asks for the **owner account** (full name, email or username, password). That account
is the **owner**. (With the optional Google sign-in set up, section 12, it is **Continue with Google** instead.) It keeps all workspaces you made before accounts existed, and uses the Claude login on this computer.
The app account is separate from the Claude account (section 12); if nobody is signed in to Claude on the
computer, the app says so and shows the steps.
**Later starts:** you stay signed in for 30 days; after that, or after signing out, you sign in again.

**Setting up on a Mac** (once)

Needs macOS 13 or newer and an internet connection. Unzip the app into the home folder (for example
`~/Intern-Co`) instead of Downloads, Desktop or Documents: macOS asks for extra permission each time a program
reads those three.

1. Install Python 3.10 or newer from https://www.python.org/downloads/ if the Mac does not have it.
2. Open Terminal, type `bash ` (with a space), drag `setup-mac.command` into the Terminal window and press
   Return. It makes a private Python environment (`.venv`) in the folder and installs the packages.
   (Double-clicking the file also works once macOS trusts it: the first time, macOS blocks files that were
   downloaded. Allow it in System Settings → Privacy & Security → **Open Anyway**.)
3. Install Claude Code, if that is not done yet. In Terminal:
   `curl -fsSL https://claude.ai/install.sh | bash`.
4. Set your API key and start the app from the same Terminal window: run
   `export ANTHROPIC_API_KEY="your-key"`, then type `bash `, drag `Intern Co.command` in, and press Return.

If a `.command` file says "permission denied", run `chmod +x *.command` in Terminal inside the folder. If the app
window does not appear, add ` --browser` after the dragged file name: the app then opens in the web browser.

On a Mac, agents run their commands in bash instead of PowerShell (the app tells Claude Code to use `/bin/bash`
even when the Mac's own shell is zsh), with the same safety rules (section 13). Mac-only additions: a command
that puts a program in the background with `&`, and `open` (which starts apps), are always refused; a command
with `( )` outside quotes always asks first. The Mac version has not been run on a Mac yet; see the checklist in section 15.

**Sending the app to someone else**

Point them to the project's GitHub page, or copy only the files in the repository. Never send the `data\` folder:
`dashboard.db` (accounts, passwords, goals, history), `library\` (shared files) and `workspaces\` (everything the
teams made). Without it, a shared copy starts empty: no account, no saved sign-in, no files. The other person follows the steps above for their computer, uses their own API key, and creates their own owner account on first start. To
give them a workspace too, export it in Settings → Data and send that file along; they import it the same way.

---

## 2. The office at a glance

- **Hubs** sit in a ring around a central area. Each hub has desks for its mini agents, a desk for its manager, and
  a table where the team can meet. A sign above each hub shows its name and state:
  - **Standby · 3 mini agents**: nobody in the hub has work.
  - **Planning…**: the hub's manager is writing a plan (or it waits for your approval).
  - **62% · ~4 min left** with a progress bar: the hub is working on a goal.
  - **Done ✓**: all its cards passed.
- **People** are your agents. Managers wear a darker shade of the hub's colour. Click someone to see what they
  are doing right now, which model they run on, how much of your usage they used, and their task cards.
- **Standby:** people without work relax at their desks, stretch, chat with teammates, sit on the benches in the
  middle, or take a walk along the walkway. Nobody pretends to work: only real work moves people for work.
- **When working:** people sit at their desks while they work, walk over to talk when they message someone, and
  show speech bubbles for plans, hand-ins and reports.

**Moving around:** drag to look around · scroll to zoom · right-drag to move · click a person to follow them ·
**Reset view** returns to the starting view.

**☰ Menu (top right)**: one button holds every option. Click it to open the menu; picking an option, clicking
elsewhere or pressing Esc closes it. A **red number** on the Menu button means items await approval in the Inbox;
a **dot** means unsaved Workspace edits.

| Option | Opens |
|---|---|
| **New goal** | Give one or more hubs a goal (section 4) |
| **Inbox** | Plans, commands and limits awaiting approval; updates and results (sections 5 and 6) |
| **Results** | Goal scores, success and failure, team details (section 6) |
| **Files** | Shared papers, data and notes for all hubs (section 8) |
| **Workspace** | Hubs, people, purposes and models (section 3) |
| **Design** | World, weather and looks (section 10) |
| **Settings** | Limits, performance, memory, safety, account, data (section 11) |
| **About & manual** | The version and this manual |

Click the **workspace name** at the top left to switch workspaces or start a new one from a template.

---

## 3. Workspaces and templates

A **workspace** is a set of hubs. You can have several workspaces and switch between them. Limits: up to 8 hubs,
12 mini agents per hub and 40 mini agents in total.

**Templates** (top left workspace name → new workspace):

| Template | Hubs |
|---|---|
| **Research Lab** | Research Ideas · Literature · Experiments (code run on your computer) · Results & Figures · Paper Writing · Review & Polish |
| **Study Buddy** | Explain · Notes & Flashcards (exportable to Anki) · Practice · Study Plan |
| **Software Studio** | Build · Fix & Test · Review & Docs · Setup & Automation |
| **Writing Desk** | Ideas & Outline · Drafting · Editing · Format & Visuals |
| **Data Desk** | Collect & Clean · Analyse · Charts & Dashboards · Report |
| **Blank** | General |

Workspaces you created earlier keep their own hubs; templates are copied when you create a workspace.

**Build a workspace for your goal** (same window, above the templates): write what you want to achieve, for example
"a monthly newsletter for my bakery, with recipes and photos", and choose **✨ Design workspace**. A small model
(Haiku, one short reply, no tools) designs a small team for it: a name, a world, 1–4 hubs with practical purposes,
and a manager and 1–3 mini agents in each, with roles. Teams are kept small on purpose, because every agent uses
memory and costs money.
- **Revise:** write what should change ("Drop Instagram", "Add someone who checks spelling") and choose **Revise**;
  the rest of the draft stays as it is. Rename the workspace in the box at the top of the draft.
- **Create workspace** saves it and opens it, then opens **New goal** with your text, every hub picked and the
  draft's lead hub as the lead. Check the goal and press Start as usual.
- Nothing is saved until you create it. Hubs use the workspace-wide models (Settings → Agents & models), and
  everything can be edited afterwards in the Workspace panel.
- Each design or revision is a small one-off use of your API key, about $0.03. It does not count toward any goal's
  budget, and it needs the owner's account, like the goal question builder.

**The Workspace panel** (☰ Menu → Workspace):
- Rename the workspace; add, remove and rename hubs, managers and mini agents; give mini agents roles.
- Each hub has a **purpose**: a short description of what it does. Managers and mini agents follow it, and managers
  use other hubs' purposes to decide whom to ask for help.
- **Models:** choose a model per hub (managers and mini agents separately) or per mini agent. "Workspace" means the
  workspace-wide model, which you set in Settings → Agents & models (the panel links there), together with the
  instructions style and helpers. Opus 5.5 (most capable), Sonnet 5.5 (balanced), Haiku 4.5 (fastest, costs least).
- Changes preview in the office straight away; **Save** applies them. A dot on the Menu button and on Workspace means unsaved
  changes. A workspace cannot be edited while one of its goals is running.

---

## 4. Giving goals

Open ☰ Menu → **New goal**:
1. **Goal:** describe the desired result as specifically as possible. Clear goals give better plans and use less.
   For help, see *Improving the goal with questions* below.
2. **Hubs:** tick one or more hubs. Hubs busy with another goal are greyed out.
3. **Lead hub** (when several are ticked): its manager owns the result and finishes the goal. See *Goals for
   several hubs* below.
4. **Budget ($)**: how much this goal may spend before it pauses and asks you (starts at $1.00).
5. **Next:** the requirements are drafted (about 20 seconds; see below).
6. Review them, then **Start goal**.

### Improving the goal with questions

A short goal such as *"I want to build a flashy realistic snake game"* leaves a lot to guess. Under the Goal box,
**✨ Improve with questions** asks a small model (Haiku, one short reply, no tools) for 3–5 questions about what
the goal leaves open, such as scope, look and feel, must-have features, platform and what "done" means. Each question
comes with a few suggested answers.
- Click an answer, or write your own in the box under it. Leave a question blank to skip it. Clicking a chosen
  answer again clears it.
- **Rewrite goal** replaces the text in the Goal box with a clear brief built from the goal and the answers: one
  short, readable paragraph of connected sentences. It adds only what the answers say. **Undo** brings back the goal as typed. The rewritten text can be edited like any goal.
- **Back** returns to the goal without changing it. The answers are kept unless the goal text is changed.
- It is optional: **Next** works the same with or without it. The requirements are then drafted from the goal
  as it stands.
- The questions and the rewrite use very little (about $0.01–0.03 together), counted in the goal's usage when that
  goal is started.

### Requirements agreed before the start

After **Next**, a small model (Haiku, one short reply, no tools) drafts what the result must deliver: the
**intent** (one sentence on what the goal really wants) and 3–8 **requirements**, each weighted **Core**,
**Important** or **Extra** (the same weights the goal check uses; see section 6). Before starting:
- edit the intent or any requirement's wording, change its weight, remove it (✕), or **+ Add requirement**;
- **Back** returns to the goal; the edits are kept unless the goal text is changed (then it is drafted again).

The managers receive the list with the goal and plan their cards to cover every core and important requirement.
At the end, the goal checker marks **exactly this list**, with its wording and weights as agreed, so the score
measures what was agreed rather than a list written afterwards. *Still missing* then lists the agreed
requirements that are not fully met.

- A draft uses very little (about $0.01–0.03), counted in the goal's usage.
- If the draft fails, **Start without requirements** is offered. The goal then runs as before, and the checker
  writes its own list at the end.

### Running goals

- **Several goals at once:** up to 4 by default (Settings). Each has its own folder, its own usage limit and its
  own banner with **⏸ Pause** and **Stop** buttons.
- **A hub works on one goal at a time.** If a manager asks a busy hub for help, they are told to ask another
  hub. A free hub that is asked for help joins that goal.

### Pausing, stopping and continuing later

- **⏸ Pause** (on the goal's banner) holds the whole team. A reply already under way stops at its next step
  (its next file read, command or message); nothing new starts, so a paused goal uses no Claude usage. Agents
  with nothing under way close their session and give their desk slot to other goals. The banner says *Paused*;
  **▶ Resume** carries on exactly where it stopped, with the agents' conversations intact. Paused time is not
  counted as the goal's working time. A pause lasts while the app is open; the hubs stay busy with the goal.
- **Stop** ends the goal now. Files already made stay in the goal folder.
- **▶ Continue** picks up a goal that was **stopped**, that **ended** before finishing, or that was **interrupted**
  because the app was closed (or the computer shut down) mid-goal. It is on the goal's result in the Inbox and in
  the Results window (the goal's workspace must be the open one, and its hubs free). It is the same goal: same
  folder, same hubs, same agreed requirements and the same entry in Results. The lead manager gets a note with how
  it ended, every earlier task card (its status, summary and files) and the files now in the folder, and is told to
  plan only what is left; you approve that plan as usual. New task cards continue the numbering (T8 after T7).
  The agents start fresh conversations, so the note and the files carry what was done. The goal's usage and time
  add up over all its runs, and the continued run gets a fresh usage limit (the goal's earlier limit; for
  goals from older versions, the default goal limit in Settings). When it
  ends, the goal is checked again, and a copy in your output folder is updated rather than duplicated.
- **Closing the app mid-goal** now keeps the goal's task cards and hubs, so it can be continued. Goals interrupted
  with older versions are continued from their files and summary only.

**Goals for several hubs.** The lead manager starts alone and first **splits the work**: one non-overlapping part
per hub, the files each hub delivers, and which hubs must wait for another hub's results. Only then do the other
managers receive the goal, with their own part and the whole split, so no two hubs plan the same job. A ticked
hub that gets no part is released for other goals. A hub that waits for another starts automatically once that
hub's cards have passed, and receives its results. When a hub's last card passes, the lead manager is told
automatically; when every hub is done, the lead finishes the goal. No status messages between managers are
needed, which saves usage.

---

## 5. Plans and task cards

After a goal starts, each hub's manager submits a **plan**: a set of **task cards**, one per piece of work,
each assigned to a mini agent. It appears in the **Inbox** (a red number on ☰ Menu).

**A task card has:**

| Field | Meaning |
|---|---|
| Title / Goal | What to produce and what it is for |
| **Deliver** | Exactly what to hand in and where (e.g. `notes/sources.md`) |
| **Done when** | 2–4 checks anyone can verify; the card passes only if all are met |
| Starts after | Earlier cards this card must wait for (it then gets their results). Waiting for another hub is set in the work split |
| Context, Steps, Use, Do not | Background, the approach, files to use, what is out of scope (folded under "Context, steps, inputs, limits") |
| Size | S (minutes), M (one sitting), L (large) |

- **Estimated usage** is shown on every plan: what its cards are expected to use, based on what past cards of
  the same sizes used (a starting estimate until there is history).
- **Amber notes** are automatic quality checks (free, no AI) that never block:
  - a vague check, a missing deliverable, a large card, two cards writing the same file;
  - too many cards waiting for others (which leaves mini agents idle);
  - **the same job in two hubs**: a card that looks like another hub's card for the same goal is flagged with the
    other card's name, so one can be dropped;
  - **one big file read many times**: when 3 or more cards read the same large shared file, a note suggests one
    card that reads it and writes a digest for the others (reading long documents is the biggest usage driver).
- **What will happen:** the plan is shown first as a short numbered list: who does what, how big it is, when it
  starts (right away, or after another step) and what they hand in. The full cards are folded away.
- **Three choices**, with the recommended one marked:
  - **Approve the plan** *(Recommended)*: the cards go to the mini agents and work starts.
  - **Send it back with changes…** opens a box for what to change; the manager rewrites the plan.
  - **Edit the tasks myself…** opens the full cards: **edit any field**, tick or untick *Starts after*, or
    tick **Drop** to remove a card, then choose Approve the plan.
- **A plan can be updated while it waits:** if a manager changes their plan before it is approved (for example
  after agreeing a new split with another hub), the new plan replaces the waiting one ("sends an updated plan").
- **Approve all:** when two or more plans are waiting anywhere in the Inbox, a bar at the top shows how many, for
  how many goals, and their combined estimate, with **Approve all** (it asks first; edits and drops in each plan are
  kept). When plans of several goals wait, each goal also gets its own **Approve all** header.
- **Approve plans automatically:** the switch at the top of the Inbox (also Settings → Safety & commands;
  owner only, off by default). Plans are approved the moment they arrive, without waiting for you, and the Inbox
  shows a **Plan approved automatically** note with the plan and its task cards. Turning it on also approves the
  plans waiting at that moment. Your goal limits still apply, and commands that need permission always still ask.
  The plan's automatic quality notes are not shown before it starts, so leave it off while you want to check plans.

**How managers are instructed** (the card guide): the mini agent sees only the card, so it must be complete; one
deliverable per card; 2–4 checks anyone can verify; "Starts after" only when truly needed, so mini agents work in
parallel; fewer, well-scoped cards (each card is a separate agent session); read big files once (one digest card,
and the office enforces it); never plan a job another hub already covers. Managers plan from a **skim** of large
shared files (the start, or a search), not a full read.

**Then:** each mini agent works on their card in the goal's folder and **hands it in** with a summary and every
check marked met or not. Their manager **reviews** it: **pass**, or **rework** with exact fixes. Cards that
wait for others start automatically when those pass. The lead manager **finishes the goal** when everything is
done and checked, and is told automatically when every hub is done.

### Inbox items: every decision is a short list of options

Each item that needs a decision shows its choices as a list, like a form question: a label, a line saying what
happens if it is chosen, and the **Recommended** one marked. Choosing an option answers at once.

| Item | What it shows | Choices |
|---|---|---|
| **Plan** | What will happen, step by step (above) | Approve *(Recommended)* · Send back with changes… · Edit the tasks myself… |
| **Command** a mini agent asks to run | A **plain-language explanation**: what the command does and why, what it touches (reads files, changes files in or outside the goal folder, deletes, installs, uses the internet, runs a program), and **Low / Medium / High risk** with the reason. **Show the command** reveals the command itself | Allow · Deny · Deny, and say what to do instead… (the recommended one follows the risk) |
| **Question** from a manager | A decision only the owner can make, with 1–2 sentences of background | The manager's 2–4 options (their recommendation marked) · Other answer… (own words) |
| **Goal limit** reached | How much the goal used against its limit, and how many task cards have passed | Raise the limit and continue *(Recommended)* · Stop the goal |

**Command explanations** come from a small, low-cost model (Claude Haiku) that did not write the command: one
short reply with no tools, so it can't run anything, and its usage (very small) counts toward the goal. It writes
in the language of the goal. While it works, the item says "Explaining the command in plain words…"; the command
can already be allowed or denied. Turn it off in Settings → Safety & commands → **Explain commands in plain
words** (then only the command is shown). The explanation is a help, not a guarantee: when unsure, choose
**Show the command**, or deny with a note.

**Managers ask instead of writing long updates.** Managers are told the owner is not a technical expert: updates
are for news only, in plain words without card numbers, and any decision comes as a **Question** with options.
The answer reaches the manager as a message (no agent waits open in the meantime).

Other Inbox items: **updates** from managers and **results** of finished goals (section 6).

---

## 6. Following progress and results

- **Goal banners** (top centre): one per goal, showing its state, lead hub, usage used against its limit,
  people working and cards passed, plus one row per hub: **% done · cards passed · ~minutes left · done ≈
  clock time**. Ended goals stay visible for about 1.5 minutes.
- **Finish estimates** come from how long your past cards took (by size), plus time for the manager's review,
  and account for cards that wait for others. Until you have some history they use starting guesses.
- **Results** arrive in the Inbox: the summary, the goal's folder, the **goal check** (below), the task cards and
  their outcome, who used how much, and **rating buttons** (✓ Success, ~ Partly, ✗ Failed).

### The goal check: how close did the result get to the intention of the prompt?

When a goal ends (finished, stopped, or the team went quiet), an **independent checker** checks the result. It is
a read-only Claude agent (Haiku) that was not on the team and cannot change anything. It:
1. writes the **intent**: one sentence on what the prompt really wants (shown as **Asked for**);
2. splits **the goal** into 3–8 concrete requirements: what the owner would check, based on the goal itself,
   not on the team's own plan. When the requirements were agreed before the start (section 4), steps 1 and 2 are
   skipped: the agreed intent and list are used as they are, and **Asked for** says *agreed before the start*.
   Each requirement is weighted:
   - **Core**: the thing itself that was asked for, without which the result is no use (e.g. the playable game
     when a game was asked for);
   - **Important**: clearly asked for or clearly expected;
   - **Extra**: supporting material (notes, specs, reports) that wasn't asked for directly;
3. opens the files the team made. It also knows the workspace's **shared files** (section 8) and which team
   members opened them. A requirement like "read report.pdf" is judged by that record and by whether the
   deliverables use the file's content, not by whether the file is in the goal folder;
4. marks each requirement **✓ met**, **~ partly** or **✗ missing**, with evidence (which file, what it saw) and
   the files that deliver it, says in one sentence what was actually **Delivered**, and lists what is still
   missing and the most useful next step.

The **intent match** (the goal's score) weighs the requirements: core counts 3, important 2, extra 1; met counts
fully, partly half. Two caps keep it honest:
- a **core requirement missing** caps the score at **39%**, so the goal is **Not achieved** however much
  supporting material exists;
- a core requirement only **partly** met caps it at **79%** (at most Partly achieved).

| Score | Verdict |
|---|---|
| 80–100% | **Achieved** |
| 40–79% | **Partly achieved** |
| 0–39% | **Not achieved** |

- **Stopped early:** a goal stopped (manually, or by closing the app) before anything was delivered gets no
  score. It is listed greyed out as **Stopped early** and is left out of the averages, the success rate and "Why
  goals fell short". A goal that delivered nothing for another reason (agents crashed, the team stopped, a usage
  limit) still scores 0%. Neither runs the checker (no usage).
- A check takes about half a minute and costs a little (about $0.05 for a small goal). When it is
  done a message appears, and the verdict shows in the Inbox result and in Results.
- **Check again** (in Results) re-runs it, e.g. after files were fixed by hand. Goals checked before version 0.13
  were scored with every requirement counted the same; they say so, and **Check again** gives them the intent
  match. Goals from before goal checks existed show **Check now**.
- Automatic checks can be switched off in Settings → Usage limits.

### The Results window

☰ Menu → **Results**, for the last 7 days, 30 days or all time, for this workspace or all workspaces. Two tabs:

**Goals**

| Part | What it shows |
|---|---|
| **Average intent match** | How close the results got to what the prompts asked for, on average (scored goals only) |
| Goals achieved · Achieved / Partly / Not achieved | Goals that scored 80% or more, and how many ended each way |
| **Why goals fell short** | For goals not achieved: finished by the team (but incomplete), stopped manually, stopped at a usage limit, agents crashed, the team stopped before finishing, or the app was closed |
| **Goal scorecards** | One per goal, newest first: score, verdict, date, why it ended, cards passed, usage. Click one for **Asked for / Delivered**, the requirements (core first) with evidence, what's missing, the next step, and **Check again** |

**Teams**: one card per hub (click it for each person in it), with three measures:

| Measure | Meaning |
|---|---|
| **Contribution** | The share of the goal checker's credit that came from this hub's (or person's) work. Each met requirement earns its weight (partly: half), shared between the people who made the files it was seen in: files they wrote or edited, or their task card's deliverable. A file put together from other people's files in the same folder (e.g. a manuscript assembled from parts) shares half its credit with them. Credit that can't be traced to anyone is reported as untraced |
| **Reliability** | Cards passed out of cards handed in at least once, plus **first try** (passed without being sent back) |
| **Usage per card** | Average usage and time per passed card |

- Cards cut off because a goal was stopped are counted as **cut off by a stop**, and cards that never began as
  **not started**; neither counts against reliability. A hub whose cards never began shows **Not started**.
- People are counted per workspace and hub, so the same name in two workspaces stays two people.
- With more than one model in use, a **By model** table compares them.

### Documents: PDF, tables, figures and references (参考文献)

When the result is something to read (a report, a paper, a summary, a guide), the team delivers it as a **PDF**,
not as raw Markdown:
- Mini agents write the text in Markdown, then the app turns it into a finished page and a PDF (`report.md` →
  `report.html` and `report.pdf` next to it). The app prints the PDF with the computer's own Edge or Chrome,
  without opening a window. Without either browser (e.g. a Mac without Chrome), only the HTML page is made; it
  opens in any browser.
- **Tables** for numbers and comparisons, and **figures** with captions: charts drawn as SVG (the computer has
  no charting library, so agents draw them directly), and pictures from your shared files. The pictures inside
  a shared PDF are saved as image files when it is added (e.g. `manuscript.pdf.pictures\page11-1.png` for a
  picture on page 11), and each figure's caption says where it comes from. Figures drawn as vector graphics
  inside a PDF cannot be taken out; agents redraw them or cite their page.
- **References (参考文献):** facts from sources are cited as [1], [2]…, with a numbered list at the end: for a web
  page the author or site, title, year, link and the date it was opened; for a shared file its name and page.
- **Checked sources:** the app keeps a list of every web page the agents opened during the goal (`_sources.json`
  in the goal's folder). A web reference that nobody opened is marked **⚠ not opened during this goal** in the
  document, and the agent is told to open it or remove it. So a link in the list is one the team really looked at.
- When the goal is done, the result in the Inbox (and the goal in the Results window) has **📄 Open document**,
  which opens the PDF in the computer's PDF viewer.

Notes, digests and drafts the team makes along the way stay Markdown files in the goal's folder.

---

## 7. Your Claude usage

**Usage costs money.** You use Claude with your own API key, and Anthropic bills your account per use. Check your
spending and set any account limits at https://console.anthropic.com.

- **Goal budgets:** each goal has a budget in dollars, set when you start it. It pauses when it reaches the budget and
  asks whether to raise it or stop.
- **Costs:** goals, people and cards show what they have used in dollars.
- **Checking the connection** is a tiny Haiku request, made at start-up, on Check now, and when the last check is over
  5 minutes old. It counts as normal API usage.

---

## 8. Shared files

☰ Menu → **Files**: add papers, data or notes that **every hub** in this workspace can use.
- Drop files in or click to choose. Up to 30 MB each and 60 files per workspace.
- Add a **note** per file (what it is, when to use it); agents see it.
- Agents get **read-only** access: your copy is never changed. They see only the list of files and notes, and
  open what they need, which saves usage.
- **PDF, Word (.docx) and PowerPoint (.pptx)** get an automatic **text copy**, which agents read instead (much
  smaller and cheaper). Agents open a PDF itself only for a specific figure, one page at a time.
- **Large files are read whole once per goal** (60 KB or more, e.g. a full paper). Managers only skim them to
  plan. One mini agent reads the file and writes a digest; the others use that digest, or read only the pages they
  need. This is the biggest saving on document goals (section 13).
- Scanned PDFs (pictures of pages) have no text, so agents read the PDF. **Excel** files cannot be read yet.

---

## 9. Agent memory (hub notebooks)

Each hub keeps a **notebook** between goals.
- Managers save short notes for future goals: your preferences, what worked, mistakes to avoid. They are
  reminded to do so when a goal finishes.
- At the start of every goal, the manager reads the notebook (newest first, up to the size set in Settings).
- **Settings → Agent memory:** see every hub's notes, add your own (e.g. "Always write in British English"),
  delete notes, clear a hub, turn notebooks off, or change their size.

---

## 10. Design

☰ Menu → **Design**; changes apply right away and never affect the agents' work.

| Option | Choices |
|---|---|
| **World** (floor, sky, centrepiece) | Open office · Space station · Forest camp · Research lab · Cozy library |
| **Time of day** | Day · Sunset · Night · Live (follows your clock) |
| **Weather** | Clear · Cloudy · Rain · Snow · Fog (no weather on the space station) |
| **Agent looks** | People · Robots · Animals · Shapes |
| **Per hub: world** | 🎲 Random (picked per hub and kept) · Match world · any world |
| **Per hub: style** | Desks · Lab benches · Greenhouse · Workshop · Studio · Library · Lounge |
| **Per hub: look** | The workspace's look, or its own |

- Each world furnishes hubs its own way: office desks, space consoles and egg chairs, forest log tables and tents,
  lab benches and DNA sculptures, library study desks and globes. Each hub gets its own colour scheme from its
  colour.
- **🎲 Shuffle all** gives every hub a new random world, style and look.

---

## 11. Settings reference

**☰ Menu → Settings.** Settings marked *owner* can be changed only by the owner.

**Usage limits** *(owner)*

| Setting | Default | Range |
|---|---|---|
| Check each goal when it ends (the goal check, section 6) | On | on / off |

**Agents & models** (for the open workspace; running goals keep their settings)

| Setting | Choices |
|---|---|
| Model | Claude Code's default · Opus 5.5 · Sonnet 5.5 · Haiku 4.5 |
| Instructions | **Lean** (about 40% less usage; default) · Full Claude Code instructions |
| Helpers | **Off** (default) · on with a chosen model: small read-only agents for reading many files |

**Memory & performance** *(owner)*

| Setting | Default | Range | What it does |
|---|---|---|---|
| Agents at once | 6 | 1–12 | Each agent is a separate process (~300–500 MB of memory). Lower it if your PC runs low on memory. |
| Goals at once | 4 | 1–8 | |
| Steps per reply | 30 | 5–120 | How many tool steps an agent may take before it must stop and report |
| Messages per goal | 80 | 10–400 | Guard against endless back-and-forth |
| Keep an idle agent open | 15 s | 5–120 | Quicker replies vs. memory in use |
| Message size limit | 64 MB | 1–512 | The largest single message an agent can send back. Raise it if agents stop with "JSON message exceeded maximum buffer size". |

**Agent memory** *(owner for the switches)*: notebooks on/off (default on); notebook size 4,000 characters
(500–20,000); the notebooks themselves.

**Safety & commands** *(owner)*: approve plans automatically (default off); run safe commands without asking (default on); explain commands in plain words
(default on, section 5). See section 13.

**Account:** your name, sign-in name, role and Claude connection; **Language** (English or 日本語, see below);
**Google account** (link or unlink, section 12); sign out; change password (or set one, for an account that only
signs in with Google); add and remove accounts, and **Reset password** for a member (section 12). Only when the
optional Google sign-in is set up *(owner)*: **Sign in with Google** with **Google only** on or off, and the Google
client (section 12); while Google only is on, the password parts are hidden.

| Setting | Default | Choices |
|---|---|---|
| Language | English | English · 日本語 (Japanese) |

**Language** changes the app's screens: menus, windows, buttons, hints, Inbox titles, hub signs, the person
card, speech-bubble small talk and the messages from the app. The page reloads in the chosen language. The same
choice is on the sign-in screen, under the sign-in box, and is kept by this computer's browser window (not per
account). What stays as written: names (workspaces, hubs, people, roles), hub purposes, goals, plans and reports
written by the agents, the goal checker's findings, file names, notebook notes, and this manual (English only).
Agents' prompts are not translated, so usage is the same in both languages; agents answer in the language the
goal is written in.

**Data:** folder locations and sizes; *(owner)* delete goal folders older than N days; export and import
workspaces.

**About app:** the app's logo, version and date; the Claude Code and Python versions on this computer; the app
folder; and **this manual**, readable inside the app (the contents links jump to each section).

---

## 12. Accounts and sign-in

- **Owner:** the first account. Uses this computer's API key, can change app-wide settings and manage
  accounts.
- **Members:** accounts the owner adds (Settings → Account). Each account has its **own workspaces, goals, inbox
  and Results**, and sees only its own.
- **Members cannot start goals yet.** Goals run on the owner's API key, so members can set up workspaces but not run
  goals. Keys for member accounts are planned (section 16).
- Passwords are stored securely (salted hashes), and sign-ins are kept for 30 days.
- **Language:** the sign-in screen has a **Language** dropdown (English · 日本語) under the sign-in box. It can be
  changed later in Settings → Account (section 11).

**The app account is not the Claude account.** The app account (a Google account, or a sign-in name and
password) only opens this app; it is set up on first start and is never sent to Claude. The agents reach Claude with the **API key saved on
the computer** (section 1). So on each computer two things are needed: an app account, and an API key.

**Is Claude connected?** The app checks at start-up, and again when a goal is started.

| What the app shows | Meaning | What to do |
|---|---|---|
| No warning, and goals start | Connected with an API key; work is billed in dollars | Nothing |
| A window "**Claude is not connected on this computer**", and the same words in the menu | No working API key here (or Claude Code is missing) | Set `ANTHROPIC_API_KEY` (section 1), restart the app, then **Check now** |
| "Claude could not be reached" | No internet, or Claude is not responding | **Check now** later |

While Claude is not connected, starting a goal is refused with the reason, so no goal starts and fails halfway.
Settings → Account shows the same state.

### Forgot password

The app sends no email, so the proof is access to **this computer's files**:

1. On the sign-in screen, **Forgot password?** → enter the email or username → **Get code**.
2. The app saves a 6-digit code to `password-reset.txt` in the app's `data\` folder (next to `dashboard.db`) and opens
   the folder with the file selected (**Show in folder** opens it again).
3. Open the file, type the verification code and a new password (twice) → **Reset password**. The app signs in, and every
   other sign-in of that account ends. The file is deleted.

- A code lasts **15 minutes** and works once; after **5 wrong codes** it stops working. **Get a new code**
  replaces the old one (wait about 20 seconds between codes).
- The screen looks the same whether or not the sign-in name exists; only the file says "No account was found
  for …".
- **Members:** the owner can also give a member a new password: Settings → Account → the member's row →
  **Reset password**. The member's sign-ins end; they sign in with the new password and can change it in
  Settings → Account.
- An account that signs in with Google can also just use **Continue with Google**. With **Google only** on there
  are no passwords; the same code then signs in directly ("Other sign-in options", below).

### Sign in with Google (optional, off by default)

**Off unless set up.** The app signs in with email or username and password. Google sign-in, and everything about
it on the screens, appears only once a Google client file `google_client.json` is placed in the app folder (see
"Making your Google client" below). Without it, nothing in this subsection applies.

An app account can be linked to a real **Google account** and then opened with **Continue with Google**. With
**Google only** on, Google is the only way in: there are no passwords. The app and everything in it stay on this
computer: Google only confirms who is signing in, and the app receives just the Google account's id, name and
email address.

**How it works.** Google does not show its sign-in page inside app windows, so choosing **Continue with Google**
opens Google in this computer's normal web browser. After signing in there, the browser tab says "Signed in to
Intern Co." and the app window continues by itself (the tab can be closed). **Cancel** stops waiting. An
unfinished sign-in expires after 10 minutes.

**Google sign-in is optional, and no client comes with the app.** It needs one free *OAuth client* from Google Cloud,
which you make yourself and save as `google_client.json` in the app folder. Without it, the app uses a sign-in name
and password. (For a *Desktop app* client the "secret" is not
secret by Google's own rules: anyone can read it from an installed app. PKCE and the app's own local address
protect the sign-in.) Settings → Account shows "The Google client is built into the app". A different client
pasted there is used instead; **Use the built-in client** removes it again.

**First start with Google.** When the app has no accounts yet and Google is available, the first-start screen
shows only **Continue with Google**. The Google account that signs in becomes the **owner** (name and address from
Google, no password), and **Google only** is turned on. Without `google_client.json` the first start asks for a
name and password as before.

**Google only** *(owner, Settings → Account → Sign in with Google)*:

- **Turn on** needs the signed-in owner linked to Google first (**Link Google account**, above it); until then it
  is refused, so the owner can't be locked out. Accounts not yet linked are named in the message.
- While it is on: the sign-in screen shows only **Continue with Google** and **Other sign-in options**; password
  sign-in, Change password and Reset password are refused; the owner's Google account can't be unlinked; new
  members are added with only their Google address.
- **Turn off** brings the passwords back (passwords set before are kept, not deleted).
- If the Google client is missing or removed, the password sign-in comes back by itself, so a missing file never
  locks anyone out.

**Other sign-in options** (no internet, the Google account lost, Google refusing) uses the same backup as Forgot
password: enter the email (the Google address or the sign-in name) → **Get code** → the code is saved to
`password-reset.txt` in the app's `data\` folder → type the verification code → **Sign in**. No password is made. Same limits:
15 minutes, one use, 5 wrong tries.

**Linking an account.** Signed in, Settings → Account → **Link Google account**, and finish in the browser. The
linked address is shown there (with **Unlink**, except while Google only is on). An account can be linked to one
Google account, and a Google account to one app account. The Google address doesn't have to match the sign-in
name.

**Accounts for other people.** The owner adds a member with their **Google address** as the sign-in name (and no
password). On their first **Continue with Google** with that address, the accounts are linked.

**What is checked.** Accounts are recognised by Google's permanent account id, not by the email address (the
address is only used once, to link an added member, and only when Google has verified it). A Google account
that isn't linked to any account here is refused; the only time Sign in with Google creates an account is the
owner, on first start. The exchange with Google uses PKCE and a one-time code, and the sign-in is handed to the
app window with a separate one-time token that never appears in a web address.

**Making your Google client.**

1. Open <https://console.cloud.google.com/> and sign in with a Google account. Create a project (any name, e.g.
   *Intern Co.*).
2. **Google Auth Platform → Branding** (older consoles: *APIs & Services → OAuth consent screen*): app name
   *Intern Co.*, a support email. **Audience:** user type **External**.
3. **Clients → Create client** (or *Credentials → Create credentials → OAuth client ID*), application type
   **Desktop app**. No redirect address has to be entered: a Desktop app client accepts the app's own address
   (`http://127.0.0.1:<port>/api/auth/google/callback`) on any port.
4. **Download JSON** for the client and save it in the app folder as `google_client.json` (next to `README.md`).
   Restart the app. A file with just `{"client_id": "…", "client_secret": "…"}` works too.
5. **Who can sign in.** While the app's publishing status is **Testing**, only the Google addresses listed under
   **Audience → Test users** can sign in. For anyone with a Google account, choose **Publish app** (status *In
   production*). Google's rules for production apps change from time to time: check what the console says on that
   page. It may ask for brand verification (a home page, a privacy policy and a verified domain) before the app
   name is shown on Google's sign-in page.

**Before sharing a copy with `google_client.json` in it:** the recipient's first start can only use Google. So
publish the app first (step 5), or add the recipient's Google address as a Test user; otherwise Google blocks
them and the only way round is deleting `google_client.json`.

| Message | Meaning |
|---|---|
| "No Intern Co. account is linked to …" | That Google account isn't linked to any account here: link it in Settings → Account, or ask the owner to add the address |
| "Password sign-in is turned off. Continue with Google." | Google only is on: use **Continue with Google**, or **Other sign-in options** |
| "Link this account to Google first (above) …" | Google only can't be turned on before the owner's account is linked |
| "Google refused the sign-in" | The client in `google_client.json` (or the pasted one) is wrong, deleted in Google Cloud, or not a *Desktop app* |
| Google says "Google hasn't verified this app" | Normal for a new client: choose **Continue** |
| Google says "Access blocked" or "app has not completed the Google verification process" | The app is in **Testing** and the address isn't a **Test user** (step 5) |
| "This sign-in session has expired" | It took over 10 minutes or was canceled: start again |

If the built-in client stops working entirely on a fresh copy (no owner yet), delete `google_client.json` and
restart: the first start then uses a password.

---

## 13. Safety: what agents can and cannot do

| Action | Rule |
|---|---|
| Read files, search, look things up online | Allowed |
| Create or edit files **inside the goal's folder** | Allowed |
| Edit files anywhere else | Refused |
| Managers editing files or running commands | Refused (managers plan and review) |
| **Safe commands** inside the goal folder: list, read and search files; run tests or scripts there (`python test_x.py`, `python -m pytest`) | Run without asking (can be turned off in Settings) |
| Other commands (install, download, delete, move, anything outside the folder) | **Ask you first** (Inbox: explained in plain words; Allow / Deny) |
| Stopping or killing programs, starting servers or background programs, shutting down or restarting | **Always refused, even if you approve** |
| Reading a whole shared PDF that has a text copy | Sent to the text copy instead |
| A **large shared file** (60 KB or more), read whole | Allowed **once per goal**: the first agent to read it whole may; everyone after is pointed to the digest the team made and may read only parts (up to 400 lines at a time, about half the file in total) |
| Managers reading a large shared file | Skim only: at most 150 lines at a time, or a search (managers plan; mini agents do the detailed reading) |

Mini agents are told which tools the computer they run on has (Python, Node.js, git, and Edge or Chrome), which are
missing, and whether Python is started with `python` or `python3`, so they don't try missing ones.
The always-refused list also covers the Mac ways to stop or background programs (`sudo`, `nohup`, `launchctl`,
`osascript`, `reboot` and similar). A file name such as `notes.md` no longer makes a reading command ask first.
A safe command must keep every path inside the goal folder, also a path written inside an option
(`--output=/somewhere`), and may not carry inline code in any form (`python -c`, `-Bc`, `--eval=`, or text fed in
with `<<`); those ask first.
Note: a script a mini agent writes and runs inside the goal folder counts as a "safe" test; turn safe commands off
in Settings if you want to approve every run.

---

## 14. Where your data lives

All in the app's own folder (the folder that holds `README.md`; its path is shown in the menu under About). Everything
private is in its `data\` folder; the code is in `app\` and the screens in `web\`.

| Location | Contents |
|---|---|
| `data\workspaces\goal-<date>-<number>\` | One folder per goal: everything your teams made |
| Your output folder (if set) | A copy of each finished goal's files, in a folder named after the date and the goal |
| `data\library\<workspace>\` | Shared files (and their text copies) |
| `data\dashboard.db` | Workspaces, accounts, goals, transcripts, task cards, goal checks, settings, notebooks |
| `data\password-reset.txt` | Only while a password reset or backup sign-in is open: the one-time code (section 12). Deleted after use |
| `google_client.json` | Your own Google sign-in client, if you made one (section 12). Keep it out of anything you share |
| `web\intern-co.ico` | The app logo |
| `.venv/` (Mac only) | The Python environment made by `setup-mac.command` |

- **Sign-in:** accounts, linked Google accounts, the Google only setting and any pasted Google client are in
  `dashboard.db`; your own client is `google_client.json`. "Stay signed in" is a cookie the app window keeps in the
  computer's own user profile (on Windows `%APPDATA%\pywebview`), outside the app's folder. Neither is part of
  a shared copy.
- **Output folder:** Settings → Data → Output folder (owner only). Choose a folder (**Choose…** opens the
  computer's folder picker in the app window; in a browser, type or paste the path) and **Save**. When a goal ends,
  its files (documents, code, pictures, but not hidden files) are copied there into a folder such as
  `2026-10-25 1428 Write a short report on snake games`; a second goal with the same name gets ` (2)`. The agents
  still work in `data\workspaces\` (that is the only place they may write), and that folder stays as it is. The
  result in the Inbox says where the copy went, and **📁 Open folder** (in the Inbox and the Results window) opens
  the copy, or the goal folder when there is no copy. Copies are yours: Clean up never deletes them. **Turn off**
  stops the copying. Goals that ended before it was set are not copied.
- **Clean up:** Settings → Data deletes goal folders not changed for N days (running goals are kept).
- **Export / import:** Settings → Data downloads all your workspaces as a file (the app window now allows
  downloads, so this also works there and not only in the browser), or adds workspaces from such a file
  (nothing existing is overwritten).

---

## 15. Troubleshooting and FAQ

**The app does not open from the shortcut.** Another copy is probably running (for example `python app/main.py` in
a terminal) and holding port 8080. Close it, or run `python app/main.py` in a terminal to see the error.

**Checking the app on a Mac (first time).** The Mac version was prepared and tested on Windows only, so the
first Mac run is the real test. Check, in order: (1) `setup-mac.command` finishes with "Setup is done";
(2) `claude` runs in Terminal and is signed in; (3) `Intern Co.command` opens the app window and the owner
account can be created; (4) the usage bar at the top shows the plan's usage; (5) one small goal with one hub
finishes and its files appear in `data/workspaces/`; (6) in that goal, a mini agent runs a Python script without the
Inbox asking; (7) Settings → Data → **Export** saves a file; (8) a PDF can be added to Files, by choosing it
and by dragging it in; (9) text can be pasted into a new goal with Cmd+V. If a step fails, the Terminal window
shows the error. If macOS asks whether `claude` may use the
keychain item "Claude Code-credentials", choose **Always Allow**: that is the Claude sign-in the agents use.

**Black command windows pop up while agents work.** Fixed: agents now start without a window, also when the app
is opened from the desktop shortcut. If you still see them, make sure you restarted the app after updating.

**Agents stopped with "JSON message exceeded maximum buffer size".** Raise Settings → Memory & performance →
Message size limit.

**Only one person is working.** Check the plan: cards with *Starts after* wait for others to pass. Untick it
where cards can run in parallel. Also check Settings → Agents at once.

**Work paused.** Look in the Inbox: a goal reached its budget. Raise it to continue, or stop the goal.

**A command is waiting for approval.** It is in the Inbox, explained in plain words with its risk. Allow only
commands whose explanation makes sense for the task; when in doubt, deny with a note saying what to do instead.

**My PC is slow while goals run.** Lower Agents at once and Goals at once.

**Where are the results?** In the goal's folder (shown in the result in the Inbox) under `data\workspaces\`, and,
if you set an output folder (Settings → Data), also copied there. **📁 Open folder** on the result opens it.

---

## 16. Not built yet

- **API keys for member accounts**, so other people can run goals with their own key.
- Resuming a goal after the app was closed mid-goal (it is marked *interrupted*).
- A history browser for past goals' full transcripts.
- Reading Excel files and scanned PDFs.
- A Japanese version of this manual (the app's screens are available in Japanese; section 11).
