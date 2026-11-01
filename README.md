# Intern Co.

Run a small office of AI agents on your own computer. Set a goal, approve the plan, and watch Claude-powered teams do the work in a live 3D office.

Intern Co. turns Claude into a team that works on your computer. Choose a ready-made workspace, or describe your aim and have one designed for you. Give it a goal, and hub managers split the work into task cards for mini agents. Nothing starts until you approve the plan, unless you turn on automatic approval.

- Watch the work happen in a live 3D office
- Review each plan, and decide on risky commands from your Inbox
- Set a budget for each goal, and pause or continue goals
- See each finished goal scored against its requirements
- Use it in English or Japanese

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

**Windows.** Run these once in a terminal, then double-click `Intern Co.bat`:

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

Agents can run commands on your computer:

- Reading and testing inside a goal's own folder runs without asking. You can turn this off in Settings.
- Commands that install, download, delete or change things outside that folder wait for your approval.
- Stopping programs, starting servers and shutting down the computer are always refused.
- File edits are only allowed inside the goal's own folder.

These checks reduce risk but do not remove it. Read commands before you allow them, and use the app at your own risk.

## Your data

Accounts, goals and files stay in the `data` folder on your computer. Never share that folder. It is not part of this repository.

## Status

Developed on Windows. The Mac version has not been run on a Mac yet. Google sign-in is optional and needs your own Google OAuth client; see `MANUAL.md`, section 12.

## Author

Jason D Anderson, 電気通信大学大学院

## License

[MIT](LICENSE)

Intern Co. is an independent project, not affiliated with or endorsed by Anthropic. Claude is a trademark of Anthropic.
