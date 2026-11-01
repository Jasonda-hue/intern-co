// Intern Co. // the interface language: English (as written in office.js) or Japanese.
// The language is chosen on the sign-in screen or in Settings → Account and kept in this browser (localStorage);
// a change reloads the page. In Japanese, a watcher translates the office's text as it appears (text, titles and
// placeholders), from the exact strings in JA and the patterns in JA_PATTERNS, so the English stays the one source
// of wording and messages from the server are covered too. Text that is data — names, goals, agents' messages,
// file names, notes, the manual — is marked translate="no" in office.js and left alone.
// Agents' prompts are not translated: agents answer in the language of the goal.

const KEY = 'interncoffice_lang';
export const LANGS = {en: 'English', ja: '日本語'};
export const lang = (() => { try { return localStorage.getItem(KEY) === 'ja' ? 'ja' : 'en'; } catch { return 'en'; } })();
export const LOCALE = lang === 'ja' ? 'ja-JP' : 'en';

export function setLang(value) {
  try { localStorage.setItem(KEY, value === 'ja' ? 'ja' : 'en'); } catch { /* storage blocked: stays as it is */ }
  location.reload();
}

// ── Japanese: exact strings (whitespace collapsed) ──
// Glossary: hub ハブ, mini agent ミニエージェント, workspace ワークスペース, manager マネージャー, owner オーナー, goal 目標, plan 計画, task card タスクカード,
// Inbox 受信箱, usage 使用量, 5-hour window 5時間枠, rework やり直し. Neutral product wording, no あなた.
const JA = {
  // small talk in speech bubbles (office.js translates these with t())
  'Quiet day!': '今日は静かだね', 'Ready for the next goal': '次の目標に備えて待機中', 'Coffee later?': 'あとでコーヒーでも？',
  'Nice weather today': '今日はいい天気', 'Any news from the owner?': 'オーナーから何か連絡ある？',
  'Tidying up my desk': 'デスクを片付け中', 'Read anything good lately?': '最近何か面白いもの読んだ？', 'Standing by 👍': '待機中 👍',
  'Stretch break!': 'ストレッチ休憩！', 'How was your weekend?': '週末はどうだった？', 'All set for the next goal?': '次の目標の準備はいい？',
  'Enjoy the quiet while it lasts': '静かなうちにひと休み', 'Anything you need?': '何か困ってない？',
  "We're ready when the owner is": 'オーナーの合図を待つだけ', 'Sure!': 'もちろん！', 'Ha, yes': 'ははっ、そうだね', 'Sounds good': 'いいね',
  'Nice': 'いいね', 'Definitely': '本当にそう', 'Same here': 'こっちも', 'Good idea': 'いい考え', 'Ready 👍': '準備OK 👍',
  'Hi everyone! 👋': 'みなさん、よろしく！👋', 'Nice day for a walk': '散歩日和だね', 'Fresh air!': '空気がおいしい！', 'Love this place': 'ここ好きだな',
  '📥 New goal: ': '📥 新しい目標: ', '📋 Plan ready for approval': '📋 計画の承認待ち', '✓ Plan approved, handing out cards': '✓ 計画承認、カードを配布中',
  '↺ Revising the plan': '↺ 計画を修正中', '✋ Approval needed': '✋ 承認が必要です', '🔎 Asking a helper: ': '🔎 ヘルパーに依頼: ', '✓ {id} passed': '✓ {id} 合格',
  '{name} · {hub} manager': '{name} · {hub} マネージャー',

  // what people are doing (the person card)
  'On standby': '待機中', 'ready for the next goal': '次の目標に備えています', 'Arriving': '到着中', 'Arriving for their first day': '初出勤で到着中',
  'Settling in at their new desk': '新しいデスクで準備中', 'Heading back to their desk': 'デスクに戻るところ',
  'Stretching their legs in the common area': '中央で足を伸ばしている', 'Relaxing on a bench': 'ベンチでひと休み', 'Walking to the common area': '中央へ移動中',
  'Heading to the benches': 'ベンチへ移動中', 'Taking a short walk': '少し散歩中', 'Hub manager': 'ハブマネージャー', 'Mini agent': 'ミニエージェント',
  'Waiting for work': '作業待ち', 'Waiting for a free desk slot': '空き枠を待機中', 'Done for now': 'ひとまず完了', 'Reading new messages': '新しいメッセージを確認中',
  'Plan awaiting approval': '計画の承認待ち', 'Goal finished': '目標完了', 'Submitting the plan for approval': '計画を承認に提出中',
  'Writing an update': '報告を作成中', 'Wrapping up the goal': '目標をまとめ中', 'Splitting the work between hubs': 'ハブ間で作業を分担中',
  'Saving a note to the hub notebook': 'ハブのノートにメモを保存中',

  // designs
  'Open office': 'オープンオフィス', 'Space station': '宇宙ステーション', 'Forest camp': '森のキャンプ', 'Research lab': '研究ラボ',
  'Cozy library': 'くつろぎの図書館', 'Day': '昼', 'Sunset': '夕方', 'Night': '夜', 'Live (system clock)': 'リアルタイム（時計に連動）',
  'Clear': '晴れ', 'Cloudy': 'くもり', 'Rain': '雨', 'Snow': '雪', 'Fog': '霧', 'People': '人', 'Robots': 'ロボット', 'Animals': '動物',
  'Shapes': '図形', 'Desks': 'デスク', 'Lab benches': '実験台', 'Greenhouse': '温室', 'Workshop': '工房', 'Studio': 'スタジオ',
  'Library': '図書館', 'Lounge': 'ラウンジ', 'Office': 'オフィス', 'Space': '宇宙', 'Forest': '森', 'Lab': 'ラボ',

  // usage, models, card states, hub signs
  'measuring…': '計測中…', '<1 min': '1分未満', '<1 min left': '残り1分未満', 'most capable': '最も高性能', 'highest usage': '使用量 最大',
  'balanced': 'バランス型', 'fastest': '最速', 'lowest usage': '使用量 最小', '⏳ Waiting': '⏳ 待機', 'In progress': '進行中',
  'Handed in': '提出済み', '✓ Passed': '✓ 合格', '↺ Rework': '↺ やり直し', '⚠ Blocked': '⚠ 停滞', 'Unfinished': '未完了',
  'Claude Code default': 'Claude Code の既定', 'Planning…': '計画中…', 'Done ✓': '完了 ✓', 'Working': '作業中', 'Standby': '待機中',

  // header, menu, goal dialog, person card
  'Head office': '本社', 'live': 'ライブ', '☰ Menu': '☰ メニュー', 'All menus': 'すべてのメニュー', 'New goal': '新しい目標',
  'Give one or more hubs a task': '1つ以上のハブにタスクを任せる', 'Inbox': '受信箱', 'Approvals, updates and results': '承認・報告・結果',
  'Results': '結果', 'Goal scores, success and failure': '目標のスコアと成否', 'Files': 'ファイル', 'Shared papers, data and notes': '共有の論文・データ・メモ',
  'Workspace': 'ワークスペース', 'Hubs, people and their models': 'ハブ・メンバー・モデル', 'Design': 'デザイン', 'World, weather and looks': 'ワールド・天気・見た目',
  'Usage': '使用量', 'Claude connection': 'Claude の接続', 'of the 5-hour limit': '（5時間枠）', 'Settings': '設定',
  'Limits, performance, memory, account': '上限・性能・記憶・アカウント', 'About & manual': '情報とマニュアル',
  'Version and the user manual': 'バージョンとユーザーマニュアル', 'Give your agents a goal': 'エージェントに目標を与える',
  "Select one or more hubs. Each hub's manager plans its part and submits the plan for approval; the lead hub owns the final result. Goals on other hubs can run at the same time.":
    '1つ以上のハブを選択します。各ハブのマネージャーが担当部分を計画して承認に提出し、リードハブが最終成果をまとめます。他のハブの目標は同時に実行できます。',
  'Goal': '目標', "e.g. Build a small web page that shows today's weather for Tokyo": '例: 東京の今日の天気を表示する小さなウェブページを作る',
  'Hubs': 'ハブ', 'Lead hub': 'リードハブ', 'Usage limit': '使用量の上限', 'Cancel': 'キャンセル', 'Start': '開始', 'Close': '閉じる',
  'Right now': '現在', 'Drag to look around': 'ドラッグで見回す', 'scroll to zoom': 'スクロールでズーム', 'right-drag to move': '右ドラッグで移動',
  'click someone to follow them': 'クリックでメンバーを追跡', 'Reset view': '視点をリセット',
  'The workspace can be changed after the current goal ends.': 'ワークスペースは実行中の目標が終わってから変更できます。',
  'Budget ($)': '予算（$）', 'Usage limit (%)': '使用量の上限（%）',
  'API key in use: work is billed in dollars. The goal pauses at its budget.': 'API キーを使用中: 作業はドルで課金されます。目標は予算に達すると一時停止します。',
  'Could not start the goal.': '目標を開始できませんでした。', 'Goal sent. The managers are on it.': '目標を送信しました。マネージャーが対応しています。',
  'Goal sent. The manager is on it.': '目標を送信しました。マネージャーが対応しています。', 'Something went wrong. Please try again.': 'うまくいきませんでした。もう一度お試しください。',
  'The goal check could not finish': '目標チェックを完了できませんでした', 'Goal complete ✓': '目標達成 ✓', 'Goal stopped': '目標を停止しました',
  'The team stopped before finishing': 'チームが完了前に止まりました', 'Goal ended': '目標が終了しました',
  'On hold': '保留中', 'Complete': '完了', 'Stopped': '停止', 'Ended': '終了', 'Interrupted': '中断', 'Stop': '停止',

  // Inbox
  'Plans and commands awaiting approval, updates and results': '承認待ちの計画とコマンド、報告、結果',
  'Approval needed: ☰ Menu → Inbox': '承認が必要です: ☰ メニュー → 受信箱',
  'Nothing here. Give your agents a goal with <b>New goal</b>.': 'まだ何もありません。<b>新しい目標</b>からエージェントに目標を与えられます。',
  'usage (measured after the first goals)': '使用量（最初の目標の後に計測）', 'Plan': '計画', 'Command': 'コマンド', 'Limit': '上限',
  'Update': '報告', 'Result': '結果', 'Dismiss': '閉じる', 'Starts after': '開始条件', 'gets their results when they pass': '合格後にその結果を受け取る',
  'none: starts right away': 'なし: すぐに開始', 'Size: S = a few minutes, M = one sitting, L = large': 'サイズ: S 数分、M ひと区切り、L 大きめ',
  'Drop': '除外', 'Title': 'タイトル', 'Goal: what to produce and what it is for': '目標: 何を作り、何のためか', 'Deliver': '成果物',
  'Exactly what to hand in, and where (e.g. notes/sources.md)': '提出するものと場所を正確に（例: notes/sources.md）', 'Done when': '完了条件',
  'One check per line, each easy to verify': '1行に1つ、見て確かめられる条件', 'Context, steps, inputs, limits': '背景・手順・入力・制約',
  'Context': '背景', "What the mini agent must know that isn't in the files": 'ファイルにない、ミニエージェントが知るべきこと', 'Steps': '手順',
  'One step per line (only if the approach matters)': '1行に1手順（進め方が重要な場合のみ）', 'Use': '使用するもの',
  'Files or sources, one per line': 'ファイルや情報源を1行に1つ', 'Do not': '禁止事項', 'Out of scope, or must not change': '対象外、または変更してはいけないもの',
  'Estimated usage:': '推定使用量:', 'from past cards of the same sizes': '同じサイズの過去のカードから算出',
  'a starting estimate; it improves as cards finish': '初期の見積もり。カードが完了するほど精度が上がります',
  'These are the task cards the mini agents will get. Edit anything before approving, or tick Drop. Amber notes are automatic quality checks.':
    'ミニエージェントに渡されるタスクカードです。承認前に自由に編集でき、不要なカードは「除外」にチェックします。黄色のメモは自動の品質チェックです。',
  'Feedback for the manager (optional, used when sending back)': 'マネージャーへのフィードバック（任意、差し戻し時に使用）', 'Send back': '差し戻す',
  'Approve plan': '計画を承認', 'Note for the mini agent (optional, used when denying)': 'ミニエージェントへのメモ（任意、拒否時に使用）', 'Deny': '拒否',
  'Allow': '許可', 'Pause at': '一時停止:', '% of 5-hour': '%（5時間枠）', '% of weekly': '%（週間）', 'Stop all goals': 'すべての目標を停止',
  'Raise limits & continue': '上限を上げて続行', 'Raise by $': '追加: $', 'Raise by': '追加:', '% of the 5-hour limit': '%（5時間枠）',
  'Stop the goal': '目標を停止', 'Raise & continue': '上げて続行', 'How did it go?': '評価', '✓ Success': '✓ 成功', '~ Partly': '~ 一部',
  '✗ Failed': '✗ 失敗', 'Missing:': '不足:', 'Checking the result against the goal…': '結果を目標と照合中…', 'Task cards': 'タスクカード',
  'Who used what': 'メンバー別の使用量', 'Rating saved': '評価を保存しました', 'success': '成功', 'partial': '一部', 'failed': '失敗',

  // Design panel
  'The look of the office world. Visual only; changes apply immediately.': 'オフィスワールドの見た目です。表示のみで、変更はすぐに反映されます。',
  'World': 'ワールド', 'Time of day': '時間帯', 'Weather': '天気',
  'A space station has no weather; it applies to the other worlds.': '宇宙ステーションには天気がありません。天気は他のワールドに適用されます。',
  'Agent looks': 'エージェントの見た目', 'world': 'ワールド', 'style': 'スタイル', 'look': '見た目',
  'Each hub can be its own world. Random picks one per hub and keeps it. Shuffle all gives every hub a new world, style and look.':
    'ハブごとに別のワールドにできます。ランダムはハブごとに1つ選んで固定します。「すべてシャッフル」で全ハブのワールド・スタイル・見た目を変えます。',
  '🎲 Shuffle all': '🎲 すべてシャッフル', "The hub's world: its furniture and decorations": 'ハブのワールド: 家具と装飾',
  'Match world': 'ワールドに合わせる', 'Workspace look': 'ワークスペースの見た目', 'Could not save the design.': 'デザインを保存できませんでした。',

  // Settings
  'Usage limits': '使用量の上限', 'Agents & models': 'エージェントとモデル', 'Memory & performance': 'メモリと性能', 'Agent memory': 'エージェントの記憶',
  'Safety & commands': '安全とコマンド', 'Account': 'アカウント', 'Data': 'データ', 'About app': 'アプリ情報', 'Loading…': '読み込み中…', 'Save': '保存',
  'Only the owner can change these settings.': 'これらの設定はオーナーのみ変更できます。',
  'Each goal has its own budget in dollars, set when you start it. The goal pauses at its budget and asks you what to do.':
    '目標ごとに開始時にドルで予算を設定します。予算に達すると目標は一時停止し、どうするかを確認します。',
  'Pause all work at': 'すべての作業を一時停止する値', '% of the 5-hour window': '%（5時間枠）', '…or at': '…または', '% of the weekly window': '%（週間枠）',
  'New goals may use': '新しい目標の使用上限', 'Pre-filled usage limit for each new goal (adjustable per goal).': '新しい目標に最初に入る使用量の上限（目標ごとに変更可能）。',
  'Check each goal when it ends': '終了時に目標をチェック',
  'An independent, read-only checker (Haiku) scores each finished goal against its brief (see Results). Each check uses a small share of the limit; goals with no output are scored without it.':
    '独立した読み取り専用のチェッカー（Haiku）が、終了した目標を依頼内容と照らして採点します（「結果」を参照）。チェックは上限のわずかな分を使います。成果物のない目標はチェッカーを使わずに採点されます。',
  'Off (recommended)': 'オフ（推奨）', 'Model': 'モデル', "Claude Code's default": 'Claude Code の既定',
  'Haiku uses the least of the limit; Opus is the most capable.': 'Haiku は上限の消費が最も少なく、Opus は最も高性能です。', 'Instructions': '指示',
  'Lean (about 40% less usage)': '簡潔（使用量 約40%減）', 'Full Claude Code instructions': 'Claude Code の完全な指示',
  "Lean gives agents a short set of working habits instead of Claude Code's long instructions.": '「簡潔」は Claude Code の長い指示の代わりに、短い作業ルールをエージェントに渡します。',
  'Helpers': 'ヘルパー',
  'Small read-only agents an agent can send to read many files. Each one has its own overhead, so off is usually cheaper.':
    '多くのファイルを読むためにエージェントが送り出せる、小さな読み取り専用エージェントです。それぞれに固定のオーバーヘッドがあるため、通常はオフの方が安く済みます。',
  'How much runs at once on this computer, and how far a single agent may go. Each agent is a separate Claude process that uses memory (roughly 300-500 MB each).':
    'このコンピューターで同時に動かす量と、1つのエージェントが進める範囲です。各エージェントはメモリを使う個別の Claude プロセスです（1つあたり約300〜500 MB）。',
  'Agents at once': '同時エージェント数', 'Lower this when the computer runs low on memory. Extra agents wait for a free slot.': 'メモリが不足するときは下げてください。超えた分のエージェントは空きを待ちます。',
  'Goals at once': '同時目標数', 'Steps per reply': '1回の返信のステップ数',
  'How many tool steps an agent may take in one go before it must stop and report. Lower values use less of the limit.':
    'エージェントが一度に実行できるツールのステップ数です。これを超えると止まって報告します。小さいほど上限の消費が減ります。',
  'Messages per goal': '目標あたりのメッセージ数', 'A guard against agents chatting back and forth forever.': 'エージェント同士のやり取りが終わらないのを防ぐ上限です。',
  'Keep an idle agent open': '待機中のエージェントを保持', 'seconds': '秒',
  'Longer means quicker replies to new messages, but uses memory meanwhile.': '長いほど新しいメッセージへの返信が速くなりますが、その間メモリを使います。',
  'Message size limit': 'メッセージサイズの上限',
  'The largest single message an agent can send back. A whole PDF or image arrives as one message. If agents stop with "JSON message exceeded maximum buffer size", raise this.':
    'エージェントが返せる1つのメッセージの最大サイズです（PDF や画像全体は1つのメッセージで届きます）。エージェントが「JSON message exceeded maximum buffer size」で止まる場合は上げてください。',
  'Each hub keeps a notebook between goals: its manager saves short lessons (preferences, what worked, what to avoid) and reads them at the start of every goal, so mistakes are not repeated.':
    '各ハブは目標をまたいでノートを持ちます。マネージャーが短い教訓（好み、うまくいったこと、避けること）を保存し、毎回の目標の開始時に読むため、同じ失敗を繰り返しません。',
  'Hub notebooks': 'ハブのノート', 'Off: managers neither read nor save notes.': 'オフ: マネージャーはノートを読みも保存もしません。', 'Notebook size': 'ノートのサイズ',
  'characters': '文字',
  'How much of each notebook a manager reads (newest first). Larger notebooks use slightly more of the limit on every goal.':
    'マネージャーが読むノートの量です（新しい順）。大きいほど毎回の目標で上限をわずかに多く使います。',
  'Notebooks': 'ノート', 'owner': 'オーナー', 'Delete': '削除', 'notebook|Clear': 'すべて消去',
  'Add a note for this hub (e.g. Always write in British English)': 'このハブへのメモを追加（例: 文章は常に「です・ます」調で書く）', 'Add': '追加',
  "What mini agents may run on this computer. File edits are allowed only inside each goal's own folder.": 'ミニエージェントがこのコンピューターで実行できることです。ファイルの編集は各目標のフォルダー内でのみ許可されます。',
  'Run safe commands without asking': '安全なコマンドは確認なしで実行',
  'Listing, reading and searching files, and running tests or scripts inside the goal folder (e.g. python test_app.py, python -m pytest). Off: every command needs approval.':
    'ファイルの一覧表示・読み取り・検索と、目標フォルダー内でのテストやスクリプトの実行（例: python test_app.py、python -m pytest）。オフ: すべてのコマンドに承認が必要です。',
  'Always needs approval: anything that installs, downloads, deletes, moves or changes files outside the goal folder.':
    '常に承認が必要: インストール、ダウンロード、削除、移動、目標フォルダー外のファイルの変更。',
  'Never allowed, even with approval: stopping or killing programs, starting servers or background programs, and shutting down or restarting the computer.':
    '承認があっても禁止: プログラムの停止・強制終了、サーバーやバックグラウンドプログラムの起動、コンピューターのシャットダウン・再起動。',
  'No API key on this computer. See Menu → Claude is not connected for the steps.': 'このコンピューターに API キーがありません。手順はメニュー →「Claude 未接続」にあります。',
  'Claude Code is not installed on this computer': 'このコンピューターに Claude Code がインストールされていません',
  "This computer's API key": 'このコンピューターの API キー', "This computer's API key (Claude Code)": 'このコンピューターの API キー',
  'Own API key': '独自の API キー', 'Not connected yet (goals need a Claude connection)': '未接続（目標の実行には Claude への接続が必要です）',
  'Who is signed in, and how their agents reach Claude.': 'サインイン中のアカウントと、そのエージェントが Claude に接続する方法です。',
  'Owner': 'オーナー', 'Member': 'メンバー', 'Sign out': 'サインアウト', 'Change password': 'パスワードの変更', 'Current password': '現在のパスワード',
  'New password (6+ characters)': '新しいパスワード（6文字以上）', 'Change': '変更', 'Accounts on this app': 'このアプリのアカウント',
  "Goals run on the owner's API key, so members can set up workspaces but cannot start goals yet.":
    '目標はオーナーの API キーで実行されるため、メンバーはワークスペースの準備はできますが、目標はまだ開始できません。',
  'Name': '名前', 'Sign-in name': 'サインイン名', 'Password': 'パスワード', 'Add account': 'アカウントを追加', 'Author': '作者', 'License': 'ライセンス', 'Claude plan': 'Claude プラン',
  'API key': 'API キー', 'not connected': '未接続', 'signed in': 'サインイン中', 'Remove': '削除', 'Language': '言語',
  "The language of the app's screens. Agents answer in the language of the goal.": 'アプリ画面の言語です。エージェントは目標の言語で答えます。',
  'Where Intern Co. keeps things on this computer.': 'Intern Co. がこのコンピューターにデータを保存している場所です。', 'Goal folders': '目標フォルダー',
  'Shared files': '共有ファイル', 'Database': 'データベース', 'Clean up': '整理', 'days': '日', 'Delete older folders': '古いフォルダーを削除',
  'Deletes goal folders (the files the teams produced) unchanged for this many days. Folders of running goals are kept.':
    'この日数のあいだ変更のない目標フォルダー（チームが作成したファイル）を削除します。実行中の目標のフォルダーは残ります。',
  'Export workspaces': 'ワークスペースをエクスポート', 'Download': 'ダウンロード',
  'All workspaces (hubs, people, purposes, designs) in one file, for backup or for moving to another computer.':
    'すべてのワークスペース（ハブ、メンバー、目的、デザイン）を1つのファイルにまとめます。バックアップや別のコンピューターへの移行に使えます。',
  'Import workspaces': 'ワークスペースをインポート', 'Choose file': 'ファイルを選択',
  'Adds the workspaces from an exported file. Nothing existing is overwritten.': 'エクスポートしたファイルからワークスペースを追加します。既存のものは上書きされません。',
  'Teams of AI agents on this computer that get tasks done efficiently while keeping Claude usage low: set a goal, approve the plan, and the agents do the work.':
    'このコンピューター上の AI エージェントのチームが、Claude の使用量を抑えながら効率よくタスクをこなします。目標を設定して計画を承認すれば、あとはエージェントが作業します。',
  'checking…': '確認中…', "The agents run as Claude Code sessions with this computer's API key.": 'エージェントは、このコンピューターの API キーを使って Claude Code のセッションとして動きます。',
  'App folder': 'アプリのフォルダー', 'Manual': 'マニュアル',
  'Everything the app can do. It is also the file MANUAL.md in the app folder, and it is kept up to date with each new feature.':
    'アプリでできることのすべてです（英語）。アプリのフォルダーにある MANUAL.md と同じ内容で、機能が増えるたびに更新されます。',
  'Saved.': '保存しました。', 'Saved. New goals use these.': '保存しました。新しい目標から使われます。', 'Password changed.': 'パスワードを変更しました。',
  'Account added. They sign in with that name and password.': 'アカウントを追加しました。その名前とパスワードでサインインできます。',
  "Clear this hub's whole notebook?": 'このハブのノートをすべて消去しますか？', 'Remove this account and its sign-ins?': 'このアカウントとそのサインイン情報を削除しますか？',
  'Delete goal folders unchanged for {days} days? The files in them are deleted permanently.': '{days}日間変更のない目標フォルダーを削除しますか？中のファイルは完全に削除されます。',
  'That file could not be imported.': 'そのファイルはインポートできませんでした。',

  // Usage window
  'Claude usage': 'Claude の使用量',
  'Agents run on your own Anthropic API key, which is billed per use in dollars. Each goal has its own budget and pauses when it reaches it.':
    'エージェントはご自身の Anthropic API キーで動き、使った分だけドルで課金されます。目標ごとに予算があり、達すると一時停止します。',
  'Check now': '今すぐ確認', 'Change limits': '上限を変更', 'Checking with Claude…': 'Claude に確認中…', 'Claude is not connected': 'Claude 未接続',
  'Pause limit': '一時停止の上限',
  '<b>Claude is not connected on this computer.</b> Goals cannot start until it is. The app account (sign-in name and password) only opens this app; the agents use your own Anthropic API key.<ol>{first}<li>Create an API key at <code>console.anthropic.com</code>.</li><li>Save it on this computer as <code>ANTHROPIC_API_KEY</code>. MANUAL.md, section 1, has the steps.</li><li>Close the app, start it again and choose <b>Check now</b>.</li></ol>':
    '<b>このコンピューターで Claude に接続されていません。</b>接続されるまで目標は開始できません。アプリのアカウント（サインイン名とパスワード）はこのアプリを開くためだけのものです。エージェントはご自身の Anthropic API キーを使います。<ol>{first}<li><code>console.anthropic.com</code> で API キーを作成します。</li><li>このコンピューターに <code>ANTHROPIC_API_KEY</code> として保存します。手順は MANUAL.md のセクション1にあります。</li><li>アプリを閉じて起動し直し、<b>今すぐ確認</b>を選びます。</li></ol>',
  'Install Claude Code (MANUAL.md, section 1).': 'Claude Code をインストールします（MANUAL.md の第1章）。',
  'Claude could not be reached. There may be no internet connection, or Claude is not responding. Choose Check now to try again.':
    'Claude に接続できませんでした（インターネット未接続、または Claude が応答していません）。「今すぐ確認」で再試行してください。',
  'Connected with an API key: work is billed per use in dollars. Goals use dollar budgets.':
    'API キーで接続中: 作業は使った分だけドルで課金されます。目標にはドルの予算を使います。',
  '5-hour window': '5時間枠', 'Weekly window': '週間枠', 'Checking plan usage…': 'プランの使用量を確認中…',
  'All work is paused at a usage limit: see Inbox.': '使用量の上限ですべての作業が一時停止中です。受信箱を確認してください。',
  'Goals, agents and cards show their approximate share of the 5-hour limit, measured from earlier work.': '目標・エージェント・カードには、これまでの作業から計測した5時間枠のおおよその割合が表示されます。',
  "Still measuring how much of the limit the office's work uses; goal and card figures appear after the first goals.":
    'オフィスの作業が上限をどれだけ使うか計測中です。目標とカードの数値は最初の目標の後に表示されます。',
  'Last checked just now.': '最終確認: たった今。',

  // Files window
  "Papers, data or notes for the whole workspace. Every hub's agents can read them but never change them. Agents see only the file names and notes and open only what they need, which keeps usage low.":
    'ワークスペース全体で使う論文・データ・メモです。すべてのハブのエージェントが読めますが、変更はできません。エージェントはファイル名とメモだけを見て必要なものだけを開くため、使用量を抑えられます。',
  'Drop files here': 'ここにファイルをドロップ', 'or click to choose': '、またはクリックして選択',
  'PDF, Word, PowerPoint, text, Markdown, CSV, code, images': 'PDF、Word、PowerPoint、テキスト、Markdown、CSV、コード、画像', 'up to 30 MB': '最大 30 MB',
  'could not be added': '追加できませんでした', "agents can't read this type": 'エージェントはこの形式を読めません',
  'Note for the agents: what is this, when to use it': 'エージェント向けメモ: 内容と使いどころ', 'No shared files yet.': '共有ファイルはまだありません。',
  'Remove {name} from the shared files?': '{name} を共有ファイルから削除しますか？',

  // Results window
  'Achieved': '達成', 'Partly achieved': '一部達成', 'Not achieved': '未達成', 'Not checked': '未チェック',
  'How close each goal got to its brief. When a goal ends, an independent read-only checker splits the goal into requirements, inspects the delivered files, and marks each requirement met, partly met or missing.':
    '各目標が依頼内容にどこまで近づいたかを示します。目標が終わると、独立した読み取り専用のチェッカーが目標を要件に分け、納品されたファイルを調べて、各要件を「達成」「一部達成」「不足」で判定します。',
  '7 days': '7日間', '30 days': '30日間', 'All time': '全期間', 'This workspace': 'このワークスペース', 'All workspaces': 'すべてのワークスペース', 'Checking…': 'チェック中…',
  'No goals yet. Start one with <b>New goal</b>; each finished goal is checked against its brief and listed here.':
    'まだ目標がありません。<b>新しい目標</b>から始めると、終了した目標が依頼内容と照合されてここに表示されます。',
  'no goal checked yet': 'チェック済みの目標はまだありません', 'Goals achieved': '目標の達成率', 'Average goal score': '平均スコア',
  'how close the work got, on average': '作業の平均的な達成度', '80% or more': '80%以上', 'below 40%': '40%未満',
  'Why goals fell short': '目標が未達になった理由', 'Goals': '目標', 'newest first': '新しい順', 'click one for the details': 'クリックで詳細',
  'Automatic goal checks are off (☰ Menu → Settings → Usage limits). Goals can still be checked individually.':
    '自動の目標チェックはオフです（☰ メニュー → 設定 → 使用量の上限）。目標は個別にチェックできます。',
  "How closely each goal's result matches what the prompt asked for, and how each hub and agent performed.":
    '各目標の結果がプロンプトの依頼内容にどこまで一致しているか、各ハブとエージェントの成果を示します。',
  'Teams': 'チーム', 'Average intent match': '意図との一致度（平均）', 'no goal scored yet': '採点済みの目標はまだありません',
  'Asked for': '依頼された内容', 'Delivered': '納品された内容', 'Core': '必須', 'Important': '重要', 'Extra': '補足',
  'Asked for · agreed before the start': '依頼された内容 · 開始前に合意済み',
  'Next': '次へ', 'Back': '戻る', 'Intent': '意図', 'Requirements': '要件', 'Start goal': '目標を開始',
  'Review the requirements': '要件の確認', '+ Add requirement': '+ 要件を追加', 'Drafting requirements…': '要件を作成中…',
  'Start without requirements': '要件なしで開始', 'Add at least one requirement.': '要件を1つ以上追加してください。',
  'What the result must have or do': '結果に必要な内容や動作',
  '✨ Improve with questions': '✨ 質問に答えて目標を改善', 'Thinking of questions…': '質問を作成中…', 'Improve the goal': '目標の改善',
  'Rewrite goal': '目標を書き直す', 'Rewriting the goal…': '目標を書き直し中…', 'Rewritten from the answers.': '回答をもとに書き直しました。',
  '⏸ Pause': '⏸ 一時停止', '▶ Resume': '▶ 再開', '▶ Continue': '▶ 続ける', 'Paused': '一時停止中',
  'Replies under way stop at their next step and nothing new starts, so no usage is spent. Resume any time while the app is open.':
    '進行中の返信は次の手順で止まり、新しい作業は始まらないため、使用量は増えません。アプリが開いている間はいつでも再開できます。',
  'The team carries on from where it paused.': 'チームは一時停止したところから続けます。',
  'Continue this goal? The team picks up from the files and finished task cards, and plans only what is left.':
    'この目標を続けますか？チームはできているファイルと完了したタスクカードから引き継ぎ、残りの作業だけを計画します。',
  'The goal could not be continued.': '目標を続けられませんでした。',
  'Goal continued. The manager is looking at what is left.': '目標を再開しました。マネージャーが残りの作業を確認しています。',
  'That goal is not running.': 'その目標は実行中ではありません。', 'That goal is already running.': 'その目標はすでに実行中です。',

  'Only a stopped, ended or interrupted goal can be continued.': '続けられるのは、停止・終了・中断した目標だけです。',
  'This goal belongs to another workspace. Switch to that workspace first.': 'この目標は別のワークスペースのものです。先にそのワークスペースに切り替えてください。',
  'The hubs that worked on this goal are gone. Start it as a new goal instead.': 'この目標を担当したハブがもうありません。新しい目標として出してください。',
  'Goal paused': '目標を一時停止しました', 'Goal resumed': '目標を再開しました',
  'Approve all {n} plans? The mini agents start working on them right away.': '{n}件の計画をすべて承認しますか？ミニエージェントがすぐに作業を始めます。',
  'Approve plans automatically': '計画を自動で承認',
  'Plans start right away, without waiting for you; the Inbox lists each plan that was approved. Your goal limits still apply. Commands that need permission always still ask.':
    '計画はあなたを待たずにすぐ始まり、承認された計画は受信箱に一覧表示されます。目標の上限はそのまま適用されます。許可が必要なコマンドは引き続き毎回確認します。',
  'Commands that need permission always still ask.': '許可が必要なコマンドは引き続き毎回確認します。',
  'Approve plans automatically? Plans start without waiting for you; commands still ask.':
    '計画を自動で承認しますか？計画はあなたを待たずに始まります。コマンドは引き続き確認します。',
  'The {n} plan(s) waiting now will be approved too.': '今待っている{n}件の計画も承認されます。',
  'Plans are now approved automatically.': '計画が自動で承認されるようになりました。',
  'Plans wait for your approval again.': '計画は再びあなたの承認を待ちます。',
  'Plan approved automatically': '計画を自動で承認しました', 'Task cards:': 'タスクカード:',
  '📁 Open folder': '📁 フォルダーを開く', 'The folder could not be opened.': 'フォルダーを開けませんでした。',
  "This goal's folder no longer exists.": 'この目標のフォルダーはもうありません。', 'Saved to {path}': '保存先: {path}',
  'Output folder': '出力フォルダー', 'Not set': '未設定', 'Choose…': '選択…',
  'When a goal ends, a copy of its files (documents, code, pictures) is saved here, in a folder named after the date and the goal. The goal folder below stays as it is.':
    '目標が終わると、そのファイル（ドキュメント、コード、画像）のコピーが、日付と目標の名前のフォルダーとしてここに保存されます。下の目標フォルダーはそのまま残ります。',
  "Choose a folder (for example in Documents) and a copy of each finished goal's files is saved there, in a folder named after the date and the goal. Not set: the files stay only in the goal folders below.":
    'フォルダー（たとえばドキュメントの中）を選ぶと、終わった目標のファイルのコピーが、日付と目標の名前のフォルダーとしてそこに保存されます。未設定のときは、ファイルは下の目標フォルダーにだけ残ります。',
  'Saved. Finished goals are copied to this folder.': '保存しました。終わった目標はこのフォルダーにコピーされます。',
  'Turned off. Files stay only in the goal folders.': 'オフにしました。ファイルは目標フォルダーにだけ残ります。',
  'The folder picker works in the app window. Type or paste the folder path instead.': 'フォルダーの選択はアプリのウィンドウでのみ使えます。フォルダーのパスを入力するか貼り付けてください。',
  'No output folder is set.': '出力フォルダーが設定されていません。',
  'Give the full path of a folder, such as C:\Users\you\Documents\Intern Co.': 'C:\Users\you\Documents\Intern Co. のように、フォルダーのフルパスを入力してください。',
  "Choose a folder outside the app's own data folder.": 'アプリ自身の data フォルダーの外にあるフォルダーを選んでください。',
  'That is a file, not a folder.': 'それはフォルダーではなくファイルです。',
  '📄 Open document': '📄 ドキュメントを開く', 'The document could not be opened.': 'ドキュメントを開けませんでした。',
  'This goal has no document to open.': 'この目標には開けるドキュメントがありません。',
  'Undo': '元に戻す', 'Answer at least one question.': '質問に1つ以上答えてください。',
  'Or in your own words (leave blank to skip)': 'または自由に記入（空欄でスキップ）',
  'Answer what matters to you: pick an answer or write your own. Leave the rest blank. The goal is then rewritten with the answers, ready for the team.':
    '大事な質問に答えてください。選択肢から選ぶか、自由に記入できます。残りは空欄のままで構いません。回答をもとに、チーム向けに目標が書き直されます。',
  'The questions could not be written. Try again, or go on with the goal as it is.':
    '質問を作成できませんでした。もう一度試すか、目標をそのまま使って進めてください。',
  'The goal could not be rewritten. Try again, or go on with the goal as it is.':
    '目標を書き直せませんでした。もう一度試すか、目標をそのまま使って進めてください。',
  'The team plans to these requirements, and the result is scored on them.':
    'チームはこれらの要件に沿って計画し、結果はこれらの要件で採点されます。',
  'Edit, add or remove requirements, and set how much each one matters. Core requirements decide whether the goal is achieved.':
    '要件の編集・追加・削除と、それぞれの重要度の設定ができます。必須の要件で目標の達成可否が決まります。',
  'The requirements could not be drafted. Try again, or start without them.':
    '要件を作成できませんでした。もう一度お試しいただくか、要件なしで開始してください。',
  "Goals currently run on the owner's API key, which only the owner's account may use.":
    '目標は現在オーナーの API キーで実行されるため、オーナーのアカウントのみが使用できます。',
  'Stopped early': '早期停止', 'Stopped before anything was delivered: not scored': '納品前に停止したため、採点対象外です',
  'Scored with the earlier method (every requirement counted the same). Check again to score it with core requirements.':
    '以前の方法で採点されています（すべての要件を同じ重みで計算）。「もう一度チェック」で、必須要件を重視した意図との一致度を採点します。',
  'Contribution': '貢献度', 'Reliability': '信頼性', 'Usage per card': 'カードあたりの使用量', 'passed cards': '合格カード',
  'First try': '一発合格', 'Usage / card': '使用量/カード', 'Time / card': '時間/カード', 'Cards': 'カード', 'By model': 'モデル別',
  'no cards': 'カードなし', 'Name': '名前', 'Model': 'モデル',
  'Not started: its cards never began, because the goals were stopped first.': '未着手：目標が先に停止されたため、カードは始まりませんでした。',
  'No team activity in this period.': 'この期間のチームの活動はありません。',
  "Contribution: the share of the goal checker's credit that came from each hub's work, traced through the files each agent made (core requirements count most). Reliability: cards passed out of those handed in.":
    '貢献度：目標チェックで得た評価のうち、各ハブの作業によるものの割合です。各エージェントが作成したファイルからたどります（必須要件ほど重く数えます）。信頼性：提出されたカードのうち合格した割合です。',
  'No scored goals yet: contribution appears once a goal with delivered work has been checked.':
    '採点済みの目標はまだありません。納品物のある目標がチェックされると貢献度が表示されます。',
  '{p} of the credit could not be traced to a person.': '評価の {p} は担当者をたどれませんでした。',
  'Team & card details': 'チームとカードの詳細', 'Running': '実行中', 'Still missing': 'まだ不足しているもの', 'Next step': '次のステップ',
  'Not checked against the goal yet.': 'まだ目標と照合されていません。', 'Check again': '再チェック', 'No task cards yet.': 'タスクカードはまだありません。',
  'Cards': 'カード', 'Passed': '合格', 'First try': '一発合格', 'Rework': 'やり直し', 'Usage / card': '使用量 / カード', 'Time / card': '時間 / カード',
  'Cards passed': 'カードの合格率', 'First-time right': '一発合格率', 'passed without rework': 'やり直しなしで合格', 'extra tries per card': 'カードあたりの追加試行',
  'Checks met': '条件の達成率', '"done when" checks': '「完了条件」のチェック', 'Usage per card': 'カードあたりの使用量', 'passed cards': '合格したカード',
  'Time per card': 'カードあたりの時間', 'to final hand-in': '最終提出まで', 'Owner rating': 'オーナー評価', 'rate results in the Inbox': '受信箱で結果を評価',
  'Usage per goal': '目標あたりの使用量', 'By hub': 'ハブ別', 'By mini agent': 'ミニエージェント別', 'By model': 'モデル別',
  'Finished by the team': 'チームが完了', 'Stopped manually': '手動で停止', 'Stopped at a usage limit': '使用量の上限で停止', 'Agents crashed': 'エージェントの異常終了',
  'The app was closed during the goal': '目標の途中でアプリが終了',

  // Workspaces window and templates
  'Workspaces': 'ワークスペース', 'Switch between saved workspaces, build one for your goal, or start one from a template.':
    '保存したワークスペースを切り替えるか、目標に合わせて作るか、テンプレートから新しく始めます。',
  'Build a workspace for your goal': '目標に合わせてワークスペースを作る',
  'Say what you want to achieve, and a small team is designed for it: hubs, their purposes and the people in them.':
    '達成したいことを書くと、それに合った小さなチーム（ハブ、その役割、メンバー）が設計されます。',
  'e.g. Write and design a monthly newsletter for my bakery, with recipes and photos':
    '例: パン屋の月刊ニュースレターをレシピと写真入りで作りたい',
  '✨ Design workspace': '✨ ワークスペースを設計', 'Designing the workspace…': 'ワークスペースを設計中…',
  'What should change? e.g. Add a hub that checks the facts': '変えたいところは？ 例: 事実を確認するハブを追加',
  'Revise': '修正', 'Revising…': '修正中…', 'Create workspace': 'ワークスペースを作成',
  'Everything can still be changed later in the Workspace panel.': '作成後も「ワークスペース」パネルですべて変更できます。',
  'Say what you want to achieve first.': '先に達成したいことを書いてください。', 'Say what should change.': '変えたいところを書いてください。',
  'The workspace could not be designed. Try again, or start from a template.':
    'ワークスペースを設計できませんでした。もう一度試すか、テンプレートから始めてください。',
  'Saved workspaces': '保存したワークスペース', 'Start from a template': 'テンプレートから始める', 'Switch workspaces after the current goal ends.': 'ワークスペースの切り替えは実行中の目標が終わってから行えます。',
  'Currently open': '表示中', 'Open': '開く', 'Create': '作成', 'Click again to delete': 'もう一度押すと削除',
  'Research Lab': '研究ラボ', 'Study Buddy': '学習サポート', 'Software Studio': 'ソフトウェアスタジオ', 'Writing Desk': 'ライティングデスク', 'Data Desk': 'データデスク',
  'Blank': '白紙',
  'Help with research: new ideas, related work, experiments run on your computer, results and figures, and a reviewed paper.':
    '研究の手伝い: 新しいアイデア、関連研究、このコンピューターでの実験、結果と図、レビュー済みの論文。',
  'Help with studying: clear explanations, notes and flashcards, practice questions, and a study plan.': '学習の手伝い: わかりやすい解説、ノートと単語カード、練習問題、学習計画。',
  'Help with coding: build features, fix bugs and test, review and document, set up and automate, on your computer.':
    'コーディングの手伝い: 機能の開発、バグ修正とテスト、レビューとドキュメント、環境構築と自動化をこのコンピューターで。',
  'Help with writing: ideas and outlines, drafts, editing and proofreading, formatting and visuals, for essays, reports, posts and presentations.':
    '文章の手伝い: アイデアと構成、下書き、編集と校正、書式とビジュアル。エッセイ、レポート、投稿、プレゼン向け。',
  'Help with data: collect and clean it, analyse it, make charts and dashboards, and write up the answer.': 'データの手伝い: 収集と整形、分析、グラフとダッシュボードの作成、結論のまとめ。',
  'One general hub to start from; add your own hubs.': '汎用のハブ1つから始めて、ハブを自由に追加します。',

  // Workspace panel
  'Hubs, their purpose, managers and mini agents': 'ハブとその目的、マネージャー、ミニエージェント', 'Switch': '切り替え',
  'Switch workspace, or start one from a template': 'ワークスペースを切り替えるか、テンプレートから始める', 'Discard': '破棄', 'Save changes': '変更を保存', 'Colour': '色',
  'Hub name': 'ハブ名', 'Remove hub': 'ハブを削除', 'Purpose: what this hub does and how (its people follow this)': '目的: このハブが何をどう行うか（メンバーはこれに従います）',
  'Manager': 'マネージャー', "Manager's name": 'マネージャーの名前', 'Models': 'モデル', 'Mini agents': 'ミニエージェント', 'Hub': 'ハブ',
  'Role, e.g. Frontend developer': '役割（例: フロントエンド開発者）', "Model for this mini agent (Hub = the hub's mini agent model)": 'このミニエージェントのモデル（ハブ = ハブのミニエージェント用モデル）',
  'Remove mini agent': 'ミニエージェントを外す', 'No mini agents yet': 'ミニエージェントはまだいません', '+ Add a mini agent': '+ ミニエージェントを追加', 'Workspace name': 'ワークスペース名',
  'The workspace-wide model, instructions and helpers are in <button class="link" data-act="agent-settings">Settings → Agents &amp; models</button>. Here, each hub and mini agent can have its own model ("Workspace" uses that default).':
    'ワークスペース全体のモデル・指示・ヘルパーは<button class="link" data-act="agent-settings">設定 → エージェントとモデル</button>にあります。ここでは、ハブとミニエージェントごとに個別のモデルを設定できます（「ワークスペース」はその既定値を使います）。',
  '+ Add a hub': '+ ハブを追加', 'Not saved yet: press Save changes to apply': '未保存: 「変更を保存」で反映されます', 'all saved': 'すべて保存済み',
  'New hub': '新しいハブ', 'The workspace needs at least one hub.': 'ワークスペースには少なくとも1つのハブが必要です。', 'Could not save.': '保存できませんでした。',
  'Workspace saved': 'ワークスペースを保存しました', 'Role': '役割',

  // sign-in
  'Create the owner account': 'オーナーアカウントの作成', 'Sign in': 'サインイン',
  'The first account owns this app and holds its workspaces and goals. It is an account for this app only, not the Claude account: the agents use your Anthropic API key.':
    '最初のアカウントがこのアプリのオーナーとなり、ワークスペースと目標を保持します。このアプリ専用のアカウントで、Claude のアカウントではありません。エージェントはこのコンピューターの Claude サインインを使います。',
  'Sign in with the app account to open the office. (This is not the Claude account.)': 'アプリのアカウントでサインインしてオフィスを開きます。（Claude のアカウントではありません）',
  'Sign-in name (email or user name)': 'サインイン名（メールアドレスまたはユーザー名）', 'Email or user name': 'メールアドレスまたはユーザー名',
  'Password again': 'パスワード（確認）', 'Create account': 'アカウントを作成', 'The two passwords are different.': '2つのパスワードが一致しません。',

  // Inbox decisions: options with the recommended one marked
  'Recommended': 'おすすめ', 'Question': '質問', 'What will happen': '実行内容', 'Quick task': 'すぐ終わる作業',
  'About one sitting': '1回分の作業', 'Large task': '大きな作業', 'starts right away': 'すぐに開始', 'hands in': '提出物:',
  'Approve the plan': '計画を承認', 'The mini agents get these tasks and start working.': 'ミニエージェントがこれらのタスクを受け取り、作業を始めます。',
  'Send it back with changes…': '修正を頼んで差し戻す…', 'What should change? e.g. "Skip step 2" or "Add a test"': '何を変えますか？（例:「ステップ2は不要」「テストを追加」）',
  'Edit the tasks myself…': 'タスクを自分で編集…', 'Change, reorder or drop task cards, then approve.': 'タスクカードを変更・並べ替え・削除してから承認します。',
  'These are the task cards the mini agents will get. Edit anything, or tick Drop, then choose Approve the plan above. Amber notes are automatic quality checks.':
    'ミニエージェントが受け取るタスクカードです。自由に編集するか「外す」にチェックを入れ、上の「計画を承認」を選びます。黄色のメモは自動の品質チェックです。',
  'Reads files': 'ファイルを読む', 'Changes files in the goal folder': '目標フォルダー内のファイルを変更',
  'Changes files outside the goal folder': '目標フォルダー外のファイルを変更', 'Deletes or overwrites files': 'ファイルを削除・上書き',
  'Installs software': 'ソフトウェアをインストール', 'Uses the internet': 'インターネットを使う', 'Runs a program or script': 'プログラムやスクリプトを実行',
  'Low risk': '低リスク', 'Medium risk': '中リスク', 'High risk': '高リスク', 'Explaining the command in plain words…': 'コマンドをわかりやすく説明しています…',
  'Deny, and say what to do instead…': '拒否して、代わりの方法を伝える…', 'e.g. "Use the file you already made"': '例:「作成済みのファイルを使って」',
  'Deny with note': 'メモを付けて拒否', 'Show the command': 'コマンドを表示', 'Other answer…': 'その他の回答…',
  'Write an answer in your own words.': '自分の言葉で回答を書きます。', 'Send answer': '回答を送信',
  'Raise the limits and continue': '上限を上げて続行', 'All goals carry on until the new limits above.': 'すべての目標が上の新しい上限まで続きます。',
  'Work ends now; finished files stay in each goal folder.': '作業はここで終わります。完成したファイルは各目標フォルダーに残ります。',
  'Raise the limit and continue': '上限を上げて続行', 'The team picks up where it stopped.': 'チームは止まったところから再開します。',
  'The team is nearly done, so a little more usage should finish the goal.': 'チームはほぼ完了しているので、少し使用量を足せば目標を終えられるはずです。',
  'Work ends now; finished files stay in the goal folder.': '作業はここで終わります。完成したファイルは目標フォルダーに残ります。',
  'The team is paused until a decision is made (replies already under way finish first).': '決定されるまでチームは一時停止します（進行中の返信は完了します）。',
  '❓ A question for the owner': '❓ オーナーに質問', 'Pick an option or write an answer.': '選択肢を選ぶか、回答を書いてください。',
  "Waiting for the owner's answer": 'オーナーの回答待ち', 'Asking the owner a question': 'オーナーに質問中',
  'Explain commands in plain words': 'コマンドをわかりやすく説明',
  'A command waiting for approval is explained by a small, low-cost model: what it does, what it touches and how risky it is, with a recommendation. Its usage counts toward the goal. Off: only the command is shown.':
    '承認待ちのコマンドを、小さく低コストなモデルが説明します（何をするか、何に触れるか、リスクの程度）。おすすめの判断も表示します。使用量は目標に含まれます。オフ: コマンドのみ表示します。',

  // Sign in with Google (sign-in screen and Settings → Account)
  'or': 'または', 'Sign in with Google': 'Google でサインイン',
  'Finish signing in with Google in the browser window that opened.': '開いたブラウザーのウィンドウで Google へのサインインを完了してください。',
  'Google account': 'Google アカウント', 'Unlink': 'リンクを解除', 'Link Google account': 'Google アカウントをリンク',
  'This Google account can also be used to sign in.': 'この Google アカウントでもサインインできます。',
  "Sign in with Google instead of the password. The Google page opens in this computer's browser.":
    'パスワードの代わりに Google でサインインします。Google のページはこのコンピューターのブラウザーで開きます。',
  'Set a password': 'パスワードを設定', 'Set': '設定', 'Password set.': 'パスワードを設定しました。',
  'Lets accounts sign in with a real Google account. Needs a free Google Cloud OAuth client of the type <b>Desktop app</b>: the steps are in the manual (About app → Manual, section 12).':
    '各アカウントが実際の Google アカウントでサインインできるようにします。種類が<b>デスクトップ アプリ</b>の Google Cloud OAuth クライアント（無料）が必要です。手順はマニュアルにあります（アプリ情報 → マニュアルの第12章）。',
  'Client ID': 'クライアント ID', 'Client secret': 'クライアント シークレット',
  'Client secret (saved)': 'クライアント シークレット（保存済み）', 'Turn off': 'オフにする', 'Turn on': 'オンにする',
  'Create with Google': 'Google で作成',
  'Continue with Google': 'Google で続ける', 'Continue in your browser to finish signing in.': 'ブラウザーでサインインを完了してください。',
  'Set up Intern Co.': 'Intern Co. のセットアップ', 'Sign in to Intern Co.': 'Intern Co. にサインイン',
  'Create the owner account to get started.': 'はじめに、オーナーのアカウントを作成してください。', 'Welcome back.': 'おかえりなさい。',
  'Other sign-in options': 'その他のサインイン方法', 'Full name': '氏名', 'Email or username': 'メールアドレスまたはユーザー名',
  'Confirm password': 'パスワード（確認）', 'Confirm new password': '新しいパスワード（確認）',
  'Sign in with a verification code': '確認コードでサインイン', 'Reset your password': 'パスワードの再設定',
  'A one-time verification code will be saved on this computer.': '1回限りの確認コードをこのパソコンに保存します。',
  'Get code': 'コードを取得', 'Get a new code': '新しいコードを取得', 'Verification code saved to': '確認コードの保存先:',
  'Show in folder': 'フォルダーで表示', 'Verification code': '確認コード',
  'Passwords do not match.': 'パスワードが一致しません。',
  'Incorrect email, username or password.': 'メールアドレス、ユーザー名またはパスワードが正しくありません。',
  'Enter your email or username.': 'メールアドレスまたはユーザー名を入力してください。',
  'A code was just made. Please wait a moment before requesting another.': 'コードを発行したばかりです。しばらく待ってから再度お試しください。',
  'This code is invalid or has expired. Request a new one.': 'このコードは無効か、有効期限が切れています。新しいコードを取得してください。',
  'Too many incorrect attempts. Request a new code.': '入力の誤りが多すぎます。新しいコードを取得してください。',
  'Incorrect code.': 'コードが正しくありません。',
  'Password sign-in is turned off. Continue with Google.': 'パスワードでのサインインはオフになっています。Google で続けてください。',
  'Use Google to create the owner account.': 'オーナーのアカウントは Google で作成してください。',
  'The verification code could not be saved.': '確認コードを保存できませんでした。',
  'No verification code is waiting. Request a new one.': '有効な確認コードがありません。新しいコードを取得してください。',
  'This sign-in session has expired. Please try again.': 'サインインの有効期限が切れました。もう一度お試しください。',
  'The first Google account to sign in owns this app and holds its workspaces and goals. This is not the Claude account: the agents use your Anthropic API key.':
    '最初にサインインした Google アカウントがこのアプリのオーナーになり、ワークスペースと目標を持ちます。これは Claude のアカウントではありません。エージェントはこのパソコンの Claude のサインインを使います。',
  'Sign in with Google to open the office. (This is not the Claude account.)': 'Google でサインインしてオフィスを開きます。（Claude のアカウントではありません。）',
  "Can't use Google?": 'Google を使えない場合', 'Sign in without Google': 'Google を使わずにサインイン',
  "For when Google can't be used, such as with no internet or when the Google account is not available. A one-time code is saved to a file on this computer; only someone who can open this computer's files can read it.":
    'Google を使えないとき（インターネットがない、Google アカウントが使えないなど）のための方法です。1回限りのコードをこのパソコン上のファイルに保存します。このパソコンのファイルを開ける人だけが読めます。',
  'Google address or sign-in name': 'Google のアドレスまたはサインイン名', 'Make a sign-in code': 'サインインコードを作る',
  'Sign in with the code': 'コードでサインイン', 'This account signs in with this Google account.': 'このアカウントはこの Google アカウントでサインインします。',
  'Google only': 'Google のみ',
  'On: accounts sign in with Google only; passwords are not used. Backup: "Can\'t use Google?" on the sign-in screen (a code in a file on this computer).':
    'オン：各アカウントは Google のみでサインインし、パスワードは使いません。予備の方法：サインイン画面の「Google を使えない場合」（このパソコン上のファイルのコード）。',
  'Accounts sign in with Google only, and passwords are no longer used. Needs this account linked to Google first.':
    '各アカウントが Google のみでサインインし、パスワードは使わなくなります。先にこのアカウントを Google にリンクする必要があります。',
  'The Google client is built into the app, so nothing needs setting up. Another Google Cloud OAuth client of the type <b>Desktop app</b> can be pasted below and is then used instead.':
    'Google クライアントはアプリに組み込まれているため、設定は不要です。別のクライアント（種類が<b>デスクトップ アプリ</b>の Google Cloud OAuth クライアント）を下に貼り付けると、そちらが使われます。',
  'Use the built-in client': '組み込みのクライアントを使う', 'Their Google address': 'その人の Google アドレス',
  'The built-in Google client is used again.': '組み込みの Google クライアントに戻しました。',
  'Sign in with Google only? Passwords are then not used, and accounts not linked to Google can only sign in with the backup code until they are.':
    'Google のみでサインインしますか？パスワードは使われなくなり、Google にリンクしていないアカウントは、リンクするまで予備のコードでしかサインインできません。',
  'Google only is off. Passwords work again.': 'Google のみをオフにしました。パスワードが再び使えます。', 'Google only is on.': 'Google のみをオンにしました。',
  'Google only is on. Not linked to Google yet: {names}. They can sign in with the backup code, or be removed and added again with their Google address.':
    'Google のみをオンにしました。まだ Google にリンクしていないアカウント：{names}。予備のコードでサインインするか、削除してから Google アドレスで追加し直してください。',
  'This app signs in with Google only.': 'このアプリは Google のみでサインインします。',
  'Create the owner account with Google.': 'オーナーのアカウントは Google で作成してください。',
  'Google only is on, so the Google account cannot be unlinked.': 'Google のみがオンのため、Google アカウントのリンクは解除できません。',
  'Set up Google sign-in first.': '先に Google サインインを設定してください。',
  'Link this account to Google first (above), so it can still sign in.': '先にこのアカウントを Google にリンクしてください（上の項目）。サインインできなくなるのを防ぐためです。',
  'Turn off "Google only" first, or nobody could sign in.': '先に「Google のみ」をオフにしてください。そうしないと誰もサインインできなくなります。',
  'The web browser could not be opened.': 'Web ブラウザーを開けませんでした。',
  'On.': 'オン。', 'Off.': 'オフ。',
  'Google sends the browser back to {uri}. There is nothing to enter for a Desktop app client.':
    'Google はブラウザーを {uri} に戻します（デスクトップ アプリのクライアントでは入力不要です）。',
  'Sign-in name or Google address': 'サインイン名または Google のアドレス', 'Password (blank: Google only)': 'パスワード（空欄: Google のみ）',
  'Google only (not signed in yet)': 'Google のみ（未サインイン）', 'Google account linked.': 'Google アカウントをリンクしました。',
  'Google account unlinked.': 'Google アカウントのリンクを解除しました。', 'Google sign-in is off.': 'Google でのサインインをオフにしました。',
  'Saved. The sign-in screen now offers Google.': '保存しました。サインイン画面に Google が表示されます。',
  'Unlink the Google account? Signing in then needs the password.': 'Google アカウントのリンクを解除しますか？以後のサインインにはパスワードが必要です。',
  'Turn off Google sign-in? Accounts without a password will then be unable to sign in.': 'Google でのサインインをオフにしますか？パスワードのないアカウントはサインインできなくなります。',
  'Account added. They sign in with Google, using that address.': 'アカウントを追加しました。そのアドレスの Google アカウントでサインインできます。',
  'Unknown sign-in provider.': '不明なサインイン方法です。', 'Sign-in with Google is not set up.': 'Google でのサインインは設定されていません。',
  'Paste the client secret too.': 'クライアント シークレットも貼り付けてください。',
  'This sign-in link has expired. Start again from the app.': 'このサインインのリンクは期限切れです。アプリからやり直してください。',
  'Sign-in was cancelled.': 'サインインはキャンセルされました。', 'Google could not be reached. Try again.': 'Google に接続できませんでした。もう一度お試しください。',
  'Google refused the sign-in. Check the Client ID and secret in Settings → Account.':
    'Google がサインインを拒否しました（設定 → アカウントのクライアント ID とシークレットを確認してください）。',
  'Google did not say which account signed in.': 'Google からサインインしたアカウントの情報が届きませんでした。',
  'The Google account has no verified email address.': 'その Google アカウントには確認済みのメールアドレスがありません。',
  'That Google account is already linked to another account here.': 'その Google アカウントは、このアプリの別のアカウントにリンク済みです。',
  'This sign-in took too long. Start again.': 'サインインに時間がかかりすぎました。やり直してください。',
  'This sign-in has ended. Start again.': 'このサインインは終了しました。やり直してください。', 'That account no longer exists.': 'そのアカウントはもう存在しません。',
  'Set a password first, so the account can still sign in.': 'サインインできなくならないよう、先にパスワードを設定してください。',
  'Without a password, the sign-in name must be their Google address.': 'パスワードなしの場合、サインイン名にはその人の Google のアドレスを入れてください。',

  // messages from the server (errors, Inbox titles, notices, plan hints)
  'A goal is running. Change workspaces after it ends (or stop it).': '目標の実行中です。終了後（または停止後）にワークスペースを変更してください。',
  'An account already exists. Sign in instead.': 'アカウントはすでにあります。サインインしてください。', 'Only an owner can add accounts.': 'アカウントを追加できるのはオーナーのみです。',
  'No such goal.': 'その目標は見つかりません。', 'This goal is still running; it is checked when it ends.': 'この目標はまだ実行中です。終了時にチェックされます。',
  'Only an owner can change these settings.': 'これらの設定を変更できるのはオーナーのみです。', 'Only an owner can delete goal folders.': '目標フォルダーを削除できるのはオーナーのみです。',
  'Please sign in.': 'サインインしてください。', 'Enter a name.': '名前を入力してください。',
  'Enter an email or a user name to sign in with.': 'サインインに使うメールアドレスまたはユーザー名を入力してください。',
  'That sign-in name is already used.': 'そのサインイン名はすでに使われています。', 'Wrong sign-in name or password.': 'サインイン名またはパスワードが違います。',
  'The current password is wrong.': '現在のパスワードが違います。', 'Only an owner can remove accounts.': 'アカウントを削除できるのはオーナーのみです。',
  'The signed-in account cannot remove itself.': 'サインイン中のアカウントは自分自身を削除できません。', 'The workspace data is not in the right format.': 'ワークスペースデータの形式が正しくありません。',
  'Forgot password?': 'パスワードを忘れた場合', 'Forgot password': 'パスワードの再設定',
  "There is no email, so a one-time code is saved to a file on this computer. Only someone who can open this computer's files can read it.":
    'メールは使わないため、1回限りのコードをこのパソコン上のファイルに保存します。このパソコンのファイルを開ける人だけが読めます。',
  'Make a reset code': '再設定コードを作る', 'Make a new code': 'コードを作り直す', 'The code was saved to': 'コードの保存先:',
  'Open the folder': 'フォルダーを開く', 'Code': 'コード', 'New password': '新しいパスワード', 'New password again': '新しいパスワード(確認)',
  'Set new password': '新しいパスワードを設定', 'Back to sign in': 'サインインに戻る',
  'Enter the sign-in name first.': '先にサインイン名を入力してください。',
  'A code was just made. Look in the file, or wait a moment before asking again.': 'コードは作成したばかりです。ファイルを確認するか、少し待ってからもう一度お試しください。',
  'This code has expired or was not made. Ask for a new one.': 'このコードは期限切れか、作成されていません。新しいコードを作ってください。',
  'The code is wrong.': 'コードが違います。', 'Too many wrong codes. Ask for a new one.': 'コードの間違いが多すぎます。新しいコードを作ってください。',
  'The reset file could not be written.': '再設定ファイルを書き込めませんでした。',
  'There is no reset file now. Ask for a new code.': '再設定ファイルは今ありません。新しいコードを作ってください。',
  'Reset password': 'パスワードを再設定', 'Only an owner can reset passwords.': 'パスワードを再設定できるのはオーナーのみです。',
  'Use Change password for the signed-in account.': 'サインイン中のアカウントは「パスワードを変更」を使ってください。',
  'A new password for this account (at least 6 characters). The account is signed out everywhere; give the member the new password, and they can change it after signing in.':
    'このアカウントの新しいパスワード(6文字以上)。現在のサインインは終了します。新しいパスワードをメンバーに伝えてください。サインイン後に変更できます。',
  'Password reset. The member signs in with the new password.': 'パスワードを再設定しました。メンバーは新しいパスワードでサインインします。',
  'A hub in the workspace data is not in the right format.': 'ハブのデータ形式が正しくありません。', 'That workspace no longer exists.': 'そのワークスペースはもう存在しません。',
  'At least one workspace is required.': 'ワークスペースは少なくとも1つ必要です。', 'Switch to another workspace before deleting this one.': 'このワークスペースを削除する前に、別のワークスペースに切り替えてください。',
  'The note is empty.': 'メモが空です。', 'The file is empty.': 'ファイルが空です。', 'No such file.': 'そのファイルは見つかりません。',
  'Describe the goal first.': '先に目標を入力してください。', 'Pick at least one hub.': 'ハブを1つ以上選んでください。',
  'That item is gone (already answered, or the goal ended).': 'この項目はもうありません（回答済み、または目標が終了しました）。', 'That goal has ended.': 'その目標は終了しました。',
  'Unknown rating.': '不明な評価です。',
  "This account is not connected to Claude yet. Goals currently run on the owner's API key, which only the owner's account may use.":
    'このアカウントはまだ Claude に接続されていません。目標は現在オーナーの API キーで動き、使えるのはオーナーのアカウントのみです。',
  'No working Anthropic API key was found on this computer, so the agents cannot work. Set ANTHROPIC_API_KEY (MANUAL.md, section 1), restart the app and start the goal again.':
    '使える Anthropic API キーがこのコンピューターに見つからないため、エージェントは作業できません。ANTHROPIC_API_KEY を設定し（MANUAL.md のセクション1）、アプリを起動し直してから目標をもう一度開始してください。',
  'Claude Code was not found on this computer, so the agents cannot work. Install it (MANUAL.md, section 1), restart the app and start the goal again.':
    'このコンピューターに Claude Code が見つからないため、エージェントは作業できません。インストールし（MANUAL.md のセクション1）、アプリを起動し直してから目標をもう一度開始してください。',
  'Goal complete': '目標達成', 'Goal ended without finishing': '目標は完了せずに終了しました', 'The goal reached its usage limit': '目標が使用量の上限に達しました',
  'Paused: usage limit reached': '一時停止: 使用量の上限に到達', 'Paused: usage limit reached, see Inbox': '一時停止: 使用量の上限に到達。受信箱を確認してください',
  'All goals are paused (replies already under way finish first).': 'すべての目標が一時停止中です（進行中の返信は完了します）。',
  'The goal is very short: say what to produce and what it is for.': '目標が短すぎます: 何を作り、何のためかを書いてください。',
  'No deliverable: say exactly what to hand in, and where.': '成果物がありません: 何をどこに提出するかを正確に書いてください。',
  'A large card: smaller cards are reviewed more reliably.': '大きなカードです: 小さいカードの方が確実にレビューできます。',
  'Many steps: the mini agent may need less detail, or this is two cards.': '手順が多すぎます: 詳細を減らすか、2枚のカードに分けてください。',
  // the page framework's own notices (shown while the app restarts)
  'Connection lost.': '接続が切れました。', 'Trying to reconnect...': '再接続しています…', 'Message too long': 'メッセージが長すぎます',
  'The message is too large for WebSocket transmission.': 'メッセージが大きすぎて送信できません。',
};

// ── Japanese: patterns for text with numbers or names in it (tried in order; the first match wins) ──
// A function replacement gets the groups; tr() translates a group that is itself interface text.
const STATUS_RE = '⏳ Waiting|In progress|Handed in|✓ Passed|↺ Rework|⚠ Blocked|Unfinished|waiting|assigned|submitted|passed|rework|blocked|unfinished';
const JA_PATTERNS = [
  // Sign in with Google
  [/^No Intern Co\. account is linked to (\S+)\. Contact the owner of this app for access\.$/,
    '$1 にリンクされた Intern Co. アカウントはありません。アクセスについては、このアプリのオーナーにお問い合わせください。'],
  [/^No Intern Co\. account is linked to (\S+)\. Sign in with your password, then link Google in Settings → Account\.$/,
    '$1 にリンクされた Intern Co. アカウントはありません。パスワードでサインインしてから、設定 → アカウントで Google をリンクしてください。'],
  // usage and time
  [/^≈ (\S+) of the 5-hour limit$/, '5時間枠の約$1'],
  [/^([\d.]+)% of the 5-hour limit$/, '5時間枠の$1%'],
  [/^resets at (.+)$/, '$1にリセット'],
  [/^resets (.+)$/, '$1にリセット'],
  [/^~(\d+) min left$/, '残り約$1分'],
  [/^~(\d+) min$/, '約$1分'],
  [/^done ≈ (.+)$/, '$1頃に完了'],
  [/^(\d+)% used$/, '$1% 使用'],
  [/^(\d+) min ago$/, '$1分前'],
  [/^Last checked (\d+) min ago\.$/, '最終確認: $1分前。'],
  [/^Current usage: (\d+)% of the 5-hour window \((.+)\)$/, (m, a, b) => `現在の使用量: 5時間枠の${a}%（${tr(b)}）`],
  [/^(\d+)% of the week \((.+)\)$/, (m, a, b) => `週間の${a}%（${tr(b)}）`],
  [/^Claude plan: (\d+)% of the 5-hour limit used \((.+)\)$/, (m, a, b) => `Claude プラン: 5時間枠の${a}%を使用（${tr(b)}）`],
  [/^(\d+)% of the weekly limit$/, '週間上限の$1%'],
  [/^All work pauses at (\d+)% of the 5-hour window or (\d+)% of the week \(the black marks\)\.$/, '5時間枠の$1%、または週間の$2%ですべての作業が一時停止します（黒い印）。'],
  [/^The goal pauses once it has used this share of the 5-hour limit\.(?: Currently (\d+)% used \((.+)\)\.)?$/,
   (m, a, b) => '5時間枠のうちこの割合を使うと、目標は一時停止します。' + (a ? `現在 ${a}% 使用中（${tr(b)}）。` : '')],
  [/^([\d.]+)% of the 5-hour limit used \(goal limit ([\d.]+)%\)$/, '5時間枠の$1%を使用（目標の上限 $2%）'],
  // counts
  [/^(\d+) mini agents?$/, 'ミニエージェント $1体'],
  [/^(\d+) hubs?$/, 'ハブ $1'],
  [/^(\d+) busy$/, '$1人'],  // after "Working ·" on a hub sign
  [/^(\d+) (?:person|people) working$/, '$1人が作業中'],
  [/^(\d+) helper calls?$/, 'ヘルパー呼び出し $1回'],
  [/^↳ (\d+) helper calls?(?:, (.+) of it)?$/, (m, n, x) => `↳ ヘルパー呼び出し ${n}回` + (x ? `（うち ${tr(x)}）` : '')],
  [/^(\d+) tries$/, '試行 $1回'],
  [/^(\d+) notes?$/, 'メモ $1件'],
  [/^(\d+) files$/, '$1 ファイル'],
  [/^(\d+) of (\d+) mini agents$/, 'ミニエージェント $1/$2体'],
  [/^(\d+)\/(\d+) cards$/, 'カード $1/$2'],
  [/^cards (\d+)\/(\d+) passed$/, 'カード $1/$2 合格'],
  [/^(\d+) plans for one goal$/, '1つの目標に計画 $1件'],
  [/^Approve all (\d+)$/, '$1件すべて承認'],
  [/^(\d+) plans? waiting$/, '承認待ちの計画 $1件'],
  [/^for (\d+) goals · estimated (.+) in total$/, (m, n, a) => `目標 ${n}件 · 合計 推定${tr(a)}`],
  [/^(\d+) of (\d+) checked goals? scored 80% or more$/, 'チェック済み$2件のうち$1件が80%以上'],
  [/^(\d+) of (\d+) scored 80% or more$/, '採点済み$2件のうち$1件が80%以上'],
  [/^across (\d+) scored goals?$/, '採点済み$1件の平均'],
  [/^(\d+) goals? stopped before anything was delivered: listed below, not scored\.$/, '$1件の目標は納品前に停止しました（下に表示、採点対象外）。'],
  [/^(\d+) goals?$/, '目標 $1件'],
  [/^first try (.+)$/, '一発合格 $1'],
  [/^(.+) per card$/, 'カードあたり $1'],
  [/^(\d+) of (\d+) handed-in cards passed$/, '提出$2件中$1件合格'],
  [/^(\d+) cards? cut off by a stop$/, '停止で中断 $1件'],
  [/^(\d+) not started$/, '未着手 $1件'],
  [/^(\d+) of (\d+) cards?$/, '$2件中$1件'],
  [/^success, of (\d+) rated goals?$/, '評価済み$1件のうちの成功率'],
  [/^avg (.+) each$/, '平均 $1'],
  [/^(.+): (\d+) of (\d+) cards passed \((.+)\)$/, '$1: $3件中$2件合格（$4）'],
  [/^Remove (\d+) mini agents?\?$/, 'ミニエージェント$1体を外しますか？'],
  [/^Deleted (\d+) folders?, freed (.+)\.$/, 'フォルダーを$1個削除し、$2 を空けました。'],
  [/^Imported (\d+) workspaces?\. Open them from the workspace name at the top left\.$/, 'ワークスペースを$1件インポートしました。左上のワークスペース名から開けます。'],
  [/^(\d+) goals are already running \(Settings → Memory & performance\)\. Wait for one, or stop one\.$/,
   'すでに$1件の目標が実行中です（設定 → メモリと性能）。終わるのを待つか、1件停止してください。'],
  // labelled values
  [/^Runs on (.+)$/, (m, a) => `モデル: ${tr(a)}`],
  [/^used (.+) on this goal$/, (m, a) => `この目標で${tr(a)}を使用`],
  [/^used (.+) on this goal \((\d+) helper calls?\)$/, (m, a, n) => `この目標で${tr(a)}を使用（ヘルパー呼び出し ${n}回）`],
  [/^used (.+)$/, (m, a) => `使用: ${tr(a)}`],
  [/^led by (.+)$/, 'リード: $1'],
  [/^estimated (.+) in total$/, (m, a) => `合計 推定${tr(a)}`],
  [/^rated (.+)$/, (m, a) => `評価: ${tr(a)}`],
  [/^Cards: (.*)$/, (m, a) => `カード: ${tr(a)}`],
  [new RegExp(`^(.+): (${STATUS_RE})$`), (m, a, b) => `${a}: ${tr(b)}`],
  [/^Claude: (.+)$/, (m, a) => `Claude: ${tr(a)}`],
  [/^Version (.+)$/, 'バージョン $1'],
  [/^On, (.+) helpers$/, 'オン（$1 ヘルパー）'],
  [/^🎲 (.+)$/, (m, a) => `🎲 ${tr(a)}`],
  [/^busy: ([\s\S]*)$/, '作業中: $1'],
  [/^Goal: ([\s\S]*)$/, '目標: $1'],
  [/^Goal checked: (\d+)%$/, '目標チェック: $1%'],
  [/^Missing: ([\s\S]*)$/, '不足: $1'],
  [/^(Achieved|Partly achieved|Not achieved|Not checked): ([\s\S]*)$/, (m, a, b) => `${tr(a)}: ${b}`],
  [/^Workspace-wide defaults for (.+?)\. Hubs and mini agents can still have their own model in the Workspace panel\. Goals already running keep what they started with\.$/,
   '$1 のワークスペース全体の既定値です。ハブとミニエージェントは「ワークスペース」パネルで個別のモデルも設定できます。実行中の目標は開始時の設定のまま続きます。'],
  [/^Name, e\.g\. My (.+)$/, (m, a) => `名前（例: 私の${tr(a)}）`],
  [/^Adding (.+)…$/, '$1 を追加中…'],
  [/^Welcome, (.+)!$/, 'ようこそ、$1！'],
  [/^(.+) is open$/, '$1 を開きました'],
  [/^Could not save: (.+)$/, '保存できませんでした: $1'],
  // what people are doing
  [/^Chatting with (.+) at the table$/, '$1とテーブルで雑談中'],
  [/^Chatting with (.+)$/, '$1と雑談中'],
  [/^Walking over to (.+)$/, '$1のところへ移動中'],
  [/^Talking with (.+)$/, '$1と話し中'],
  [/^Session error: ([\s\S]*)$/, 'セッションエラー: $1'],
  [/^Awaiting approval to run: (.+)$/, '実行の承認待ち: $1'],
  [/^Running (.+)$/, '$1 を実行中'],
  [/^Asking a helper: (.+)$/, 'ヘルパーに依頼中: $1'],
  [/^Messaging (.+)$/, '$1 にメッセージを送信中'],
  [/^Handing in card (.+)$/, 'カード $1 を提出中'],
  [/^Reviewing card (.+)$/, 'カード $1 をレビュー中'],
  [/^Searching the web for (.+)$/, 'ウェブで $1 を検索中'],
  [/^Reading (.+)$/, '$1 を読み込み中'],
  [/^Writing (.+)$/, '$1 を書き込み中'],
  [/^Editing (.+)$/, '$1 を編集中'],
  [/^Looking for (.+)$/, '$1 を探しています'],
  [/^Searching (.+)$/, '$1 を検索中'],
  [/^Opening (.+)$/, '$1 を開いています'],
  // server: errors, Inbox titles and bodies, notices, plan hints
  [/^That file could not be imported: ([\s\S]+)$/, 'そのファイルはインポートできませんでした: $1'],
  [/^The (new )?password needs at least (\d+) characters\.$/, (m, n, k) => `${n ? '新しい' : ''}パスワードは${k}文字以上必要です。`],
  [/^(.+) cannot be empty\.$/, (m, a) => `${tr(a)}を入力してください。`],
  [/^(.+) is too long \(max (\d+) characters\): "([\s\S]*)"$/, (m, a, b, c) => `${tr(a)}が長すぎます（最大${b}文字）: 「${c}」`],
  [/^Mini agent name in (.+)$/, '$1 のミニエージェント名'],
  [/^Two people are called "(.+)"\. Names must be unique so the team can tell them apart\.$/, '「$1」という名前の人が2人います。チームが区別できるよう、名前は重複しないようにしてください。'],
  [/^At most (\d+) hubs fit in the office\.$/, 'オフィスに置けるハブは最大$1つです。'],
  [/^There are two hubs called "(.+)"\.$/, '「$1」という名前のハブが2つあります。'],
  [/^(.+): mini agents must be a list\.$/, '$1: ミニエージェントのデータ形式が正しくありません。'],
  [/^(.+): each mini agent must be an object\.$/, '$1: ミニエージェントのデータ形式が正しくありません。'],
  [/^(.+) has (\d+) mini agents; one hub seats at most (\d+)\.$/, '$1 のミニエージェントは$2体です。1つのハブは最大$3体までです。'],
  [/^That is (\d+) mini agents; the office holds at most (\d+)\.$/, 'ミニエージェントが$1体います。オフィスの定員は最大$2体です。'],
  [/^At most (\d+) workspaces can be saved\. Delete one first\.$/, '保存できるワークスペースは最大$1件です。先に1件削除してください。'],
  [/^Files can be up to (\d+) MB\.$/, 'ファイルは最大 $1 MB までです。'],
  [/^A workspace can have up to (\d+) shared files\. Remove one first\.$/, '1つのワークスペースあたりの共有ファイルは最大$1件です。先に1件削除してください。'],
  [/^Unknown template "(.+)"\.$/, '不明なテンプレート「$1」です。'],
  [/^Busy with another goal: (.+)\. Pick other hubs, or wait\.$/, '別の目標で作業中です: $1。他のハブを選ぶか、終わるのを待ってください。'],
  [/^(.+) has no mini agents yet\. Add some in the Workspace panel first\.$/, '$1 にはまだミニエージェントがいません。先に「ワークスペース」パネルで追加してください。'],
  [/^(.+) wants to run a command$/, '$1 がコマンドの実行を求めています'],
  [/^(.+) asks to run a command$/, '$1 がコマンドの実行を求めています'],
  [/^(.+) sends an updated plan, asked for by (.+)$/, '$1 から更新された計画（$2 の依頼）'],
  [/^(.+) sends an updated plan$/, '$1 から更新された計画'],
  [/^(.+) sends a plan, asked for by (.+)$/, '$1 から計画（$2 の依頼）'],
  [/^(.+) sends a plan$/, '$1 から計画'],
  [/^This goal has used about (\d+)% of the 5-hour limit, and its limit was (\d+)%\.$/, 'この目標は5時間枠の約$1%を使いました（上限は$2%）。'],
  [/^This goal has used (\$[\d.]+), and its limit was (\$[\d.]+)\.$/, 'この目標は$1を使いました（上限は$2）。'],
  [/^Progress so far: (\d+) of (\d+) task cards passed\.$/, 'ここまでの進捗: タスクカード$2枚中$1枚が合格。'],
  [/^starts after step (.+)$/, 'ステップ$1の後に開始'],
  [/^(.+) runs it and carries on\.$/, '$1 が実行して作業を続けます。'],
  [/^(.+) is told no and finds another way\.$/, '$1 に拒否が伝わり、別の方法を探します。'],
  [/^The note goes to (.+)\.$/, 'メモは $1 に届きます。'],
  [/^(.+) rewrites the plan using the note\.$/, '$1 がメモをもとに計画を作り直します。'],
  [/^The answer for (.+)$/, '$1 への回答'],
  [/^Update from (.+)$/, '$1 からの報告'],
  [/^(.+) stopped working$/, '$1 が停止しました'],
  [/^This goal used 80% of its limit \(([\d.]+% of the 5-hour limit|\$[\d.]+) of ([\d.]+% of the 5-hour limit|\$[\d.]+)\)$/, (m, a, b) => `この目標は上限の80%を使いました（${tr(b)}のうち${tr(a)}）`],
  [/^Used about (.+), against a limit of (.+)\. Everyone on the goal is paused \(replies already under way finish first\)\.$/,
   (m, a, b) => `約${tr(a)}を使いました（上限 ${tr(b)}）。この目標のメンバーは全員一時停止中です（進行中の返信は完了します）。`],
  [/^5-hour usage reached (\d+)% \(pause limit: (\d+)%\)\.$/, '5時間枠の使用量が$1%に達しました（一時停止の上限: $2%）。'],
  [/^Weekly usage reached (\d+)% \(pause limit: (\d+)%\)\.$/, '週間の使用量が$1%に達しました（一時停止の上限: $2%）。'],
  [/^The 5-hour window resets at (.+)\.$/, '5時間枠は$1にリセットされます。'],
  [/^Hard to verify: "([\s\S]*)"$/, '確認しにくい条件: 「$1」'],
  [/^Cards (\d+) and (\d+) both deliver "(.+)": they may overwrite each other\.$/, 'カード$1と$2がどちらも「$3」を納品します: 互いに上書きするおそれがあります。'],
  [/^(\d+) of (\d+) cards wait for other cards, so only (\d+) mini agent\(s\) start at first\. Untick "Starts after" where the cards can run in parallel\.$/,
   '$2枚中$1枚のカードが他のカードを待つため、最初に始めるミニエージェントは$3人だけです。並行できるカードは「開始条件」のチェックを外してください。'],
  [/^Many cards for one mini agent: (.+)\. Fewer, larger cards cost less\.$/, '1体のミニエージェントにカードが多すぎます: $1。少なく大きなカードの方が安く済みます。'],
  [/^(\d+) cards of this goal read (.+) \(~(\d+) KB\): (.+)\. One digest card that the others use would cost much less\.$/,
   (m, n, f, kb, where) => `この目標の${n}枚のカードが ${f}（約${kb} KB）を読みます: ` +
     `${where.replace(/^cards? /, 'カード ').replace(' here', '（このハブ）').replace(', plus ', '、ほかに ')}。要約カードを1枚作って他のカードが使う方がずっと安く済みます。`],
  [/^Looks like the same job as "(.+)" \((.+)\): drop one\.$/, '「$1」（$2）と同じ作業のようです: どちらかを除外してください。'],
];

// ── translating ──
const cache = new Map();

function lookup(text) {
  if (Object.hasOwn(JA, text)) return JA[text];
  for (const [re, to] of JA_PATTERNS) {
    if (re.test(text)) return text.replace(re, to);
  }
  return null;
}

// One piece of interface text in Japanese (unchanged when nothing matches, or in English).
// Whole text first, then its parts: " · " and line breaks, then sentences.
export function tr(text) {
  if (lang !== 'ja' || !text) return text;
  const core = text.replace(/\s+/g, ' ').trim();
  if (!core || !/[A-Za-z]/.test(core)) return text;
  if (cache.has(core)) { const hit = cache.get(core); return hit == null ? text : keepSpace(text, hit); }
  let out = Object.hasOwn(JA, core) ? JA[core] : null;
  if (out == null && /(^|\s)·(\s|$)|\n/.test(text)) {  // the parts on their own (before patterns, whose (.+) would swallow them)
    const parts = text.trim().split(/((?:^|\s+)·(?:\s+|$)|\n)/);
    const joined = parts.map((p, i) => (i % 2 ? p : tr(p))).join('');
    if (joined !== text.trim()) out = joined;
  }
  if (out == null) out = lookup(core);
  if (out == null && /[.!?] +[A-Z]/.test(core)) {
    const sentences = core.replace(/([.!?]) +(?=[A-Z])/g, '$1\u0001').split('\u0001');  // (no lookbehind: older Safari)
    const done = sentences.map((s) => lookup(s) ?? s);
    if (done.some((s, i) => s !== sentences[i])) out = done.join('');
  }
  if (cache.size > 5000) cache.clear();
  cache.set(core, out);
  return out == null ? text : keepSpace(text, out);
}

const keepSpace = (text, out) => (/^\s/.test(text) ? ' ' : '') + out + (/\s$/.test(text) ? ' ' : '');

// For code: the text for a key (English: the key, without any "context|" prefix), with {name} parameters filled in.
export function t(key, params) {
  let text = lang === 'ja' ? (Object.hasOwn(JA, key) ? JA[key] : tr(key.replace(/^[a-z]+\|/, ''))) : key.replace(/^[a-z]+\|/, '');
  if (params) text = text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
  return text;
}

// ── the watcher: translates the page's text as it is added or changed (Japanese only) ──
const BLOCK = 'script, style, [translate="no"]';    // nothing inside is translated
const SKIP = `${BLOCK}, textarea, code, pre`;          // text inside is left alone (a textarea's text is its value)
const ATTRS = ['title', 'placeholder', 'aria-label'];
const missing = new Set();

function translateText(node) {
  const el = node.parentElement;
  if (!el || el.closest(SKIP)) return;
  const v = node.nodeValue;
  const out = tr(v);
  if (out !== v) node.nodeValue = out;
  else if (window.I18N_DEBUG && /[A-Za-z]{3}/.test(v) && !/[぀-ヿ一-鿿]/.test(v)) missing.add(v.trim());
}

function translateAttrs(el) {
  if (el.closest(BLOCK)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) { const out = tr(v); if (out !== v) el.setAttribute(a, out); }
  }
}

function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) return translateText(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.closest(BLOCK)) return;
  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && n.matches(BLOCK) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)});
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n);
    else translateAttrs(n);
  }
}

export function startTranslator() {
  document.documentElement.lang = lang;
  if (lang !== 'ja') return;
  translateTree(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(translateTree);
      else if (r.type === 'characterData') translateText(r.target);
      else if (r.type === 'attributes') translateAttrs(r.target);
    }
  }).observe(document.body, {childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ATTRS});
  // window.I18N_DEBUG = true in the console, use the app, then I18N_MISSING() lists English text left untranslated
  window.I18N_MISSING = () => [...missing].sort();
}
