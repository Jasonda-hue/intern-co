# Notice
The README and MANUAL will be updated soon.

# 1. Description

Intern Co. is an in-development project that gets the most out of AI agents while keeping costs as low as possible. It runs a small office of Claude agents on your own computer: you set a goal or task, approve the plan, and watch the agents work on it in a live 3D world.

Instead of one long chat with a single AI, the work is split across hubs, small teams that each have a manager and a few mini agents. Managers break the goal into small task cards, mini agents do the work, and managers review every result before it counts. 
Only agents with work run, duplicate cards are caught before anyone works on them, and each hub can use a cheaper model where the work allows it. Hubs often work in parallel, and their managers talk to each other when needed to keep the work efficient.

You stay in control the whole time. Every mini agent is transparent, so you can see what each one is working on. Risky commands from the agents are sent to you and wait for your approval. When the goal ends, a separate checker that was not on the team scores the result against the requirements you agreed on at the start.

![The Intern Co. 3D office, with six hubs of agents around a central courtyard](docs/images/office.png)

Main features of this project:
- **Prompt builder** 
- **Hubs**
- **Task cards**
- **Parallel goals and agents**
- **Guardrails**
- **Budgets limitation**
- **Workspace builder**
- **Goal scoring and KPIs**

## 2. Background and Purpose

AI tools are now widely used, but users often cannot tell how well these tools perform or how well they achieve the goal the user intended. At the same time, token usage and prices have been rising as newer AI models become more capable.
These problems call for an AI tool that keeps costs low while delivering efficient, high-quality results.

The purpose of this project is to create a tool that lets users accomplish their tasks on as small a budget as possible with these 3 goals in mind.
- **Efficieny and Clarity**\
  Every task card the AI agents work on should stay low-cost while still delivering an efficient result.
- **Controlability**\
  High-risk actions and key decisions must be supervised by the user and explained clearly.
- **Feedbacks**\
  An independent checker scores the overall result, showing what to improve for the next task.

## 3. How it works

![How a goal moves from you to the managers, the mini agents and the final check](docs/images/how-it-works.png)

You start by writing the goal, choosing which hubs work on it and setting a dollar budget. If the goal is unclear, ✨ Improve with Questions sends it to a Haiku helper, which asks 3–5 questions and rewrites the goal from your answers. Another Haiku helper drafts the intent and 3–8 requirements, each weighted *core*, *important* or *extra*, and you edit the list before the goal starts.

If more than one hub works on the goal, the lead hub's manager first divides it into one non-overlapping part per hub (`split_work`). Each manager then plans its part as small task cards for its own mini agents (`submit_plan`), and every plan comes to your Inbox to approve or send back, unless you turn on automatic approval. Once a plan is approved, the mini agents work their cards inside the goal's own folder, several at a time. Every shell command goes through the app's command check: safe reading and testing in the folder runs, risky commands wait for you in the Inbox, and a few, like stopping programs or shutting down the computer, are always refused. Mini agents only communicate with their own manager and teammates. Only managers communicate across hubs, so they can share progress and coordinate when one hub's work depends on another's. When something needs your decision, a manager asks you with a few clear options.

When a mini agent hands in a card (`submit_work`), its manager reviews it and either passes it or sends it back for rework (`review_work`). When the whole goal is done, the lead manager finishes it (`finish_goal`), and the goal's files are copied to your output folder. A separate read-only checker on Haiku, which was not on the team, then scores the result against the agreed requirements, and you can add your own rating.

The budget is watched the whole time. At 80% you get a warning; at 100% the team pauses, and the Inbox asks whether to raise the limit and continue or stop the goal.

| Build a workspace for your goal | Start a goal |
|---|---|
| ![The Workspaces window with the workspace builder and six templates](docs/images/workspaces.png) | ![The New goal dialog with hubs, a lead hub and a dollar budget](docs/images/new-goal.png) |


## 4. Algorithm map

(Under development)

## Tech stack

| Area | Tools |
|---|---|
| Agents | Python, `asyncio`, Claude Agent SDK, Claude Code |
| App server | NiceGUI, FastAPI |
| Interface | JavaScript, Three.js for the 3D office |
| Data | SQLite |
| Desktop window | pywebview |

## Before you start

You need:

- Python 3.10 or newer
- [Claude Code](https://code.claude.com/docs/en/overview)
- Your own Anthropic API key from [console.anthropic.com](https://console.anthropic.com)

**Intern Co. runs only on your own API key.** No key is included, and the app does not store yours. Usage is billed to your Anthropic account, so set budgets you are comfortable with. Each goal has its own budget and pauses when it reaches it.

Keep your key private. Never put it in a file you share or commit.

## Install and run

Download the code:

```
git clone https://github.com/Jasonda-hue/intern-co.git
cd intern-co
```

**Windows.** Run these once in a terminal, then run `Intern Co.bat`:

```
pip install -r requirements.txt
setx ANTHROPIC_API_KEY "your-key"
```

`setx` saves the key for every program on your computer, so other Claude Code use on it is billed to the key too.

**Mac.** Run `bash setup-mac.command` once, then start the app from Terminal with your key set:

```
export ANTHROPIC_API_KEY="your-key"
bash "Intern Co.command"
```

The first account you create becomes the owner. It is an account for this app only. `MANUAL.md` has the full guide, and it can also be read inside the app.

## Safety

Agents can run commands on your computer automatically.
Read commands before you allow them, and use the app at your own risk.

## Your data

Accounts, goals and files stay in the `data` folder on your computer. Never share that folder. It is not part of this repository.

## Status

In development. Built and tested on Windows; the Mac version has not been run on a Mac yet. 

## Author

Jason D Anderson, The University of Electro-Communications (電気通信大学大学院), Graduate School

## License

[MIT](LICENSE)

Intern Co. is an independent project, not affiliated with or endorsed by Anthropic. Claude is a trademark of Anthropic.
