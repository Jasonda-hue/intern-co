"""
Ready-made companies, each built around the tasks people want AI agents to help with. A template is a set of
hubs; every hub has a colour, a written purpose (which its manager and interns follow), a manager and interns
with roles. Loading a template creates a new saved company that the owner can rename and edit like any other.

Purposes say what the hub *does for you*, in practical terms (the files it reads and writes, what it runs on
your computer), so managers plan concrete work.

Names are unique within each template (agents address each other by name).
"""
from __future__ import annotations

from typing import Any

TEMPLATES: list[dict[str, Any]] = [
    {
        'key': 'research',
        'theme': 'lab',
        'name': 'Research Lab',
        'description': 'Help with research: new ideas, related work, experiments run on your computer, results and '
                       'figures, and a reviewed paper.',
        'hubs': [
            {'name': 'Research Ideas', 'style': 'studio', 'color': '#8A7DB3', 'manager': 'Nadia',
             'purpose': 'Come up with research ideas and ways to make the research better: gaps in current work, new '
                        'questions, hypotheses, improvements to methods. Rank ideas by value and effort, and say how '
                        'each could be tested.',
             'interns': [('Kira', 'Idea generator'), ('Leo', 'Research strategist')]},
            {'name': 'Literature', 'style': 'library', 'color': '#C0975A', 'manager': 'Sofia',
             'purpose': 'Find and summarise related papers and sources (title, authors, year, link, key finding), so '
                        'ideas and the paper build on and cite real work. Never invent a reference.',
             'interns': [('Elena', 'Literature reviewer'), ('Felix', 'Source finder')]},
            {'name': 'Experiments', 'style': 'lab', 'color': '#5B7DB1', 'manager': 'Morgan',
             'purpose': 'Write and run experiments on this computer: code, simulations or scripts in the goal folder. '
                        'Record the setup, parameters and raw results in files so every run can be repeated.',
             'interns': [('Ava', 'Experiment engineer'), ('Ben', 'Simulation developer'), ('Chloe', 'Research programmer')]},
            {'name': 'Results & Figures', 'style': 'desks', 'color': '#4F9A9A', 'manager': 'Owen',
             'purpose': 'Analyse experiment results: statistics, tables and plots ready for the paper. Report '
                        'uncertainty honestly and never overstate a finding.',
             'interns': [('Grace', 'Data analyst'), ('Daniel', 'Figure designer')]},
            {'name': 'Paper Writing', 'style': 'studio', 'color': '#C47A62', 'manager': 'Clara',
             'purpose': 'Write the paper: abstract, sections, figures, captions and citations (Markdown, LaTeX or '
                        'Word), based only on results and sources the team has verified.',
             'interns': [('Maya', 'Academic writer'), ('Noah', 'LaTeX & formatting')]},
            {'name': 'Review & Polish', 'style': 'lounge', 'color': '#6E9C7A', 'manager': 'Marcus',
             'purpose': 'Review drafts like a strict reviewer: check every claim against the results and sources, '
                        'point out weak arguments and missing experiments, and proofread. Report problems clearly.',
             'interns': [('Hugo', 'Critical reviewer'), ('Isla', 'Proofreader')]},
        ],
    },
    {
        'key': 'learning',
        'theme': 'library',
        'name': 'Study Buddy',
        'description': 'Help with studying: clear explanations, notes and flashcards, practice questions, and a '
                       'study plan.',
        'hubs': [
            {'name': 'Explain', 'style': 'library', 'color': '#5B7DB1', 'manager': 'Morgan',
             'purpose': "Explain topics clearly at the learner's level: step by step, with worked examples and "
                        'analogies. Use the shared files (slides, textbooks, notes) as the source when given.',
             'interns': [('Ava', 'Tutor'), ('Ben', 'Example writer')]},
            {'name': 'Notes & Flashcards', 'style': 'desks', 'color': '#C0975A', 'manager': 'Sofia',
             'purpose': 'Turn material into study notes, summaries, mind-map outlines and flashcards (question / '
                        'answer, ready to import into Anki as CSV).',
             'interns': [('Elena', 'Note maker'), ('Felix', 'Flashcard maker')]},
            {'name': 'Practice', 'style': 'workshop', 'color': '#C47A62', 'manager': 'Clara',
             'purpose': 'Make practice questions, quizzes and mock exams with full worked solutions, and mark '
                        'answers with specific, encouraging feedback.',
             'interns': [('Chloe', 'Question writer'), ('Leo', 'Marker')]},
            {'name': 'Study Plan', 'style': 'lounge', 'color': '#6E9C7A', 'manager': 'Marcus',
             'purpose': 'Plan the studying: what to learn in what order, a realistic timetable up to the exam or '
                        'deadline, and what to review next based on weak spots.',
             'interns': [('Hugo', 'Study planner')]},
        ],
    },
    {
        'key': 'software',
        'theme': 'office',
        'name': 'Software Studio',
        'description': 'Help with coding: build features, fix bugs and test, review and document, set up and '
                       'automate, on your computer.',
        'hubs': [
            {'name': 'Build', 'style': 'workshop', 'color': '#5B7DB1', 'manager': 'Morgan',
             'purpose': 'Build features and apps: write and change code in the goal folder. Keep it simple, working '
                        'and easy to run.',
             'interns': [('Ava', 'Backend developer'), ('Ben', 'Frontend developer'), ('Chloe', 'Full-stack developer')]},
            {'name': 'Fix & Test', 'style': 'lab', 'color': '#6E9C7A', 'manager': 'Marcus',
             'purpose': 'Find and fix bugs, write and run tests, and try edge cases. Report exactly what was run and '
                        'what passed or failed.',
             'interns': [('Hugo', 'Test engineer'), ('Isla', 'Debugger')]},
            {'name': 'Review & Docs', 'style': 'library', 'color': '#C0975A', 'manager': 'Sofia',
             'purpose': 'Review code for bugs, clarity and security, and write the README, usage guide and code '
                        'comments people need.',
             'interns': [('Elena', 'Code reviewer'), ('Felix', 'Technical writer')]},
            {'name': 'Setup & Automation', 'style': 'desks', 'color': '#8A7DB3', 'manager': 'Owen',
             'purpose': 'Set up projects and tools, write scripts that automate repetitive tasks, and explain how to '
                        'install and run things on this computer.',
             'interns': [('Maya', 'Automation engineer'), ('Noah', 'Setup helper')]},
        ],
    },
    {
        'key': 'writing',
        'theme': 'library',
        'name': 'Writing Desk',
        'description': 'Help with writing: ideas and outlines, drafts, editing and proofreading, formatting and '
                       'visuals, for essays, reports, posts and presentations.',
        'hubs': [
            {'name': 'Ideas & Outline', 'style': 'studio', 'color': '#8A7DB3', 'manager': 'Nadia',
             'purpose': 'Find the angle and structure: brainstorm ideas, pick the strongest, and write a clear '
                        'outline with the key point of every section.',
             'interns': [('Kira', 'Idea generator'), ('Leo', 'Outliner')]},
            {'name': 'Drafting', 'style': 'desks', 'color': '#5B7DB1', 'manager': 'Morgan',
             'purpose': 'Write the drafts from the outline, in the requested tone and length, using facts from the '
                        'shared files and sources (never invented ones).',
             'interns': [('Ava', 'Writer'), ('Ben', 'Researcher-writer')]},
            {'name': 'Editing', 'style': 'library', 'color': '#C47A62', 'manager': 'Clara',
             'purpose': 'Edit for clarity, flow and tone; cut what is not needed; fix grammar and spelling; check '
                        'facts against the sources.',
             'interns': [('Maya', 'Editor'), ('Noah', 'Proofreader')]},
            {'name': 'Format & Visuals', 'style': 'lounge', 'color': '#4F9A9A', 'manager': 'Owen',
             'purpose': 'Make it ready to use: formatting (Markdown, Word, slides), headings, tables, simple charts '
                        'and image suggestions.',
             'interns': [('Grace', 'Layout designer'), ('Daniel', 'Slide maker')]},
        ],
    },
    {
        'key': 'data',
        'theme': 'space',
        'name': 'Data Desk',
        'description': 'Help with data: collect and clean it, analyse it, make charts and dashboards, and write up '
                       'the answer.',
        'hubs': [
            {'name': 'Collect & Clean', 'style': 'workshop', 'color': '#C0975A', 'manager': 'Sofia',
             'purpose': 'Get the data ready: load files (CSV, Excel exports, JSON) or gather public data, then fix '
                        'types, missing values and duplicates. Log every change so it can be repeated.',
             'interns': [('Elena', 'Data engineer'), ('Felix', 'Data cleaner')]},
            {'name': 'Analyse', 'style': 'lab', 'color': '#5B7DB1', 'manager': 'Morgan',
             'purpose': 'Answer the question with the data: statistics, comparisons and simple models, run with '
                        'Python scripts on this computer. State assumptions and limits.',
             'interns': [('Ava', 'Data analyst'), ('Ben', 'Statistician')]},
            {'name': 'Charts & Dashboards', 'style': 'studio', 'color': '#4F9A9A', 'manager': 'Owen',
             'purpose': 'Turn results into clear, labelled charts, and simple dashboards or HTML pages when useful.',
             'interns': [('Daniel', 'Chart designer'), ('Chloe', 'Dashboard builder')]},
            {'name': 'Report', 'style': 'desks', 'color': '#C47A62', 'manager': 'Clara',
             'purpose': 'Write the findings up: the answer first, then the evidence, charts and recommendations, '
                        'backed only by the analysis.',
             'interns': [('Maya', 'Report writer')]},
        ],
    },
    {
        'key': 'blank',
        'theme': 'office',
        'name': 'Blank',
        'description': 'One general hub to start from; add your own hubs.',
        'hubs': [
            {'name': 'General', 'style': 'desks', 'color': '#6B7A8F', 'manager': 'Morgan',
             'purpose': 'Handle any task the owner gives, carefully and simply.',
             'interns': [('Ava', 'Generalist'), ('Ben', 'Generalist')]},
        ],
    },
]


def template(key: str) -> dict[str, Any] | None:
    return next((t for t in TEMPLATES if t['key'] == key), None)


def company_from_template(key: str, name: str = '') -> dict[str, Any]:
    """A company document (not yet cleaned or saved) built from a template."""
    t = template(key)
    if t is None:
        raise ValueError(f'Unknown template "{key}".')
    return {
        'name': (name or '').strip() or t['name'],
        'template': t['key'],
        'design': {'theme': t.get('theme', 'office')},
        'departments': [{'name': h['name'], 'color': h['color'], 'purpose': h['purpose'], 'style': h.get('style', 'desks'),
                         'manager': {'name': h['manager']},
                         'interns': [{'name': n, 'role': r} for n, r in h['interns']]} for h in t['hubs']],
    }


def summaries() -> list[dict[str, Any]]:
    """What the template gallery shows."""
    return [{'key': t['key'], 'name': t['name'], 'description': t['description'],
             'hubs': [h['name'] for h in t['hubs']],
             'people': sum(1 + len(h['interns']) for h in t['hubs'])} for t in TEMPLATES]
