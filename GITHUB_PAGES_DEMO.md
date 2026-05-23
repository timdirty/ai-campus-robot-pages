# GitHub Pages Demo

This workspace can publish App2 and App3 together as a static online practice demo.

## Competition Readiness

Before presenting the local App2 demo, run:

```powershell
cd App2-Campus-Service-Robot\app2
npm run verify:competition
```

Before presenting both App2 and App3 together, run from the workspace root:

```powershell
npm run competition:verify
```

## New Computer One-Click Start

Use Git clone whenever possible. Git preserves the Mac executable bit for `.command` launchers; ZIP downloads may require one `chmod +x`.

| Machine | App2 local full demo | App3 local full demo |
| --- | --- | --- |
| Windows | Double-click `App2-Campus-Service-Robot/start-app2-windows.bat` | Double-click `App3-Mindful-Guardian/start-app3-windows.bat` |
| macOS | Double-click `App2-Campus-Service-Robot/start-app2-mac.command` | Double-click `App3-Mindful-Guardian/start-app3-mac.command` |

First-run behavior on a new computer:

- The launcher checks Node.js / npm and opens the Node.js download page if it cannot install automatically.
- The launcher runs `npm install` inside the app folder.
- Python / YOLO dependencies are optional; if installation fails, App2 and App3 continue with browser/local fallback flows.
- App2 uses `http://localhost:3000` and bridge `http://localhost:3204`.
- App3 uses `http://localhost:11503`, bridge `http://localhost:3203`, and pairing display `https://localhost:3443/robot-display.html`.

macOS ZIP fallback:

```bash
cd App2-Campus-Service-Robot
chmod +x start-app2-mac.command
./start-app2-mac.command

cd ../App3-Mindful-Guardian
chmod +x start-app3-mac.command
./start-app3-mac.command
```

Current App2 validation coverage:

- Static competition audit for forbidden wording, old ports, legacy robot names, mojibake, and required demo-guide sections.
- 100-round browser stress test across teaching, delivery, life, and ROBOT display sync.
- API smoke test for AI campus, classroom analysis, dispatch recommendation, teacher reply, student report, robot reply, and display emotion.
- Offline hardware path: no Arduino required for demo; commands are still logged and the robot state remains synchronized.
- ROBOT display path: open `/app2/robot-display.html` or the local `robot-display.html?bridge=localhost:3204` link for the iPad / robot face panel.

Combined App2 + App3 validation coverage:

- App2 local competition verification: static audit, type check, build, AI/API smoke, and 100 browser rounds.
- App3 check: local guardian AI tests, privacy visual tests, type check, and production build.
- GitHub Pages verification: portal, App2, App2 Robot Display, App3, and App3 Robot Display load on desktop and mobile without horizontal overflow or hard errors.
- 100-round combined stress test: App2 robot display sync, App3 robot assignment, teacher handoff, incident resolution, panel fit, mobile fit, and main-screen fit must all pass with `failureCount: 0`.

## Judge Highlights

- One robot, one story: App2 consistently demonstrates R-01 so the delivery, patrol, broadcast, and ROBOT display feel like one physical campus service robot.
- Teaching has teacher value: attendance, focus signals, AI suggestions, and student reports give professors a reason to trust the system.
- Life service has student value: rain dismissal, corridor slow-down reminders, area broadcasts, and schedule reminders solve visible school-day problems.
- Delivery is operational: order creation, route tracking, pickup completion, and command logs prove the robot is doing work, not only showing screens.
- Offline-ready AI: the demo can keep running without Arduino; API smoke checks still cover AI replies, classroom analysis, dispatch recommendation, and robot display emotion.
- App3 care loop: privacy-first sensing, acoustic signals, proactive teacher handoff, and the Guardian robot display give a second complete demo story for student wellbeing.

## Judge Demo Cards

Use these as the competition-day talking cards. Each card should end with visible evidence on screen.

| Card | What to show | Judge takeaway | Evidence screen |
| --- | --- | --- | --- |
| App2 Life | Trigger rain dismissal or corridor slow-down, choose broadcast zones, send the message | Student safety reminders are created from real school-day situations | Life command log and R-01 task record |
| App2 Delivery | Create one pickup task, show R-01 route status, complete pickup | The robot is doing operational work, not only displaying a dashboard | Delivery status and pickup completion |
| App2 Teaching | Run attendance / focus analysis, ask for AI support, produce a student-facing report | Teachers get useful evidence and a next action | Teaching analysis and generated report |
| App2 Robot Display | Send a message or emotion from App2, then switch to the robot face panel | The app and robot-facing UI are synchronized | Robot display face / latest event |
| App3 Guardian | Select a risk area, dispatch robot support, hand off to teacher, resolve | Student wellbeing flow goes from sensing to responsible human action | App3 map, mission status, and resolved record |
| App3 Robot Display | Show Guardian robot controls and latest mission status | The care robot has a clear on-site role | Guardian robot display status |

Best closing move: end on a log, report, or robot display reaction. Judges should see the action record, not only hear the explanation.

## Demo Proof Points

- Software proof: `npm run verify:competition` must pass before presenting; it includes static audit, build, API smoke, and 100 browser rounds.
- Robot proof: R-01 is the only active robot in App2, and its route, status, pickup, broadcast, and display messages are synchronized.
- AI proof: API smoke covers campus summary, classroom analysis, dispatch recommendation, teacher reply, student report, robot reply, and display emotion.
- Hardware proof: the bridge runs on `3204`; Arduino can be disconnected during practice while commands still create logs and display events.
- Presentation proof: the final screen should show logs, report output, or ROBOT display reaction so judges see evidence instead of only narration.

## Competition Scorecard

Use this as the final readiness checklist:

- Evidence: `verify:competition` ends with `rounds 100`, `routeChecks 100`, and `flowChecks 16`.
- Combined evidence: root `demo:stress` ends with `rounds 100`, App2 sync `100/100`, App3 assignment / teacher handoff / incident resolution `100/100`, and `failureCount: 0`.
- AI: API smoke reports Gemini or local fallback for every teaching, dispatch, report, and robot reply endpoint.
- Robot: App2 shows only R-01 during the competition story, and the robot display reacts to App2 commands.
- Student value: life demo proves rain dismissal, corridor safety, area broadcast, and schedule reminders.
- Teacher value: teaching demo proves attendance, focus signal, suggested reply, and report evidence.
- Operations value: delivery demo proves order creation, route status, pickup completion, and command records.

## App2 Demo Flow

Recommended judge-facing sequence:

1. Open App2 life tab and trigger dismissal rain / corridor safety broadcast.
2. Open delivery, create an order, show R-01 moving, then complete pickup.
3. Open teaching, run classroom recognition or a student question, then show the teacher-facing response.
4. Open ROBOT display and show the face/message reacting to App2 commands.
5. End with command logs / report output to prove the software, AI, and robot UI are connected.

## App3 Demo Flow

Recommended judge-facing sequence:

1. Open App3 and show the privacy-first campus guardian overview.
2. Open sensing or alerts and trigger a high-attention area.
3. Dispatch the guardian robot to that area and show the assignment reaching App3 Robot Display.
4. Trigger teacher handoff, then resolve the incident so judges see the full action record.
5. End on the App3 robot face panel with `Live Guardian Flow`, visible controls, and the latest mission status.

## 90-Second Talk Track

Use this sequence when time is tight:

1. "This is one campus service robot, R-01. It is not only a screen: every action becomes a robot task, a display message, and a command record."
2. Life: trigger rain dismissal or corridor safety. Show area selection, broadcast text, and how the system turns weather / crowd risk into a student-facing reminder.
3. Delivery: create one order. Show destination, moving status, pickup completion, and the fact that the app never invents extra robots.
4. Teaching: run classroom recognition or student support. Explain that teachers get attendance, focus signals, suggested replies, and report evidence.
5. ROBOT display: open the robot face panel. Send one emotion/message from App2 and show the iPad / robot screen reacting live.
6. Finish: show command logs or report output. The closing line is: "The value is that school tasks become visible, traceable, and executable by one robot."

## Hardware Backup Checklist

Before judging starts:

- Open `http://localhost:3000/#life` and `http://localhost:3000/robot-display.html?bridge=localhost:3204`.
- Confirm `/api/ready` reports AI ready and `/api/health` reports bridge port `3204`.
- Keep Arduino optional: if serial is not connected, App2 should still show offline demo mode and allow AI, delivery, broadcast, and ROBOT display sync.
- Keep App3 robot controls usable: if EV3 / SPIKE hardware is not detected, the external robot panel should still record local demo commands instead of blocking the flow.
- Keep the robot story consistent: say "R-01" in the demo, and avoid mentioning multiple robot units unless explaining future school expansion.
- Prepare one fallback path: if hardware is loose, demonstrate Life -> Delivery -> Teaching -> ROBOT display with the local bridge and command logs.

## Judge Q&A

- "Is this only software?"  
  No. App2 sends each action into robot state, ROBOT display sync, and command logs. When serial hardware is connected, the same bridge path can forward commands to Arduino / robot hardware.

- "What happens if Arduino is not connected?"  
  The demo stays usable. App2 shows offline operation, keeps AI features available, records commands, and lets judges inspect the robot display response.

- "Why one robot instead of many?"  
  The competition demo deliberately uses one robot, R-01, so the story is easy to follow. The same task model can later scale to multiple school robots.

- "What is the strongest student benefit?"  
  Life service turns rain, hallway speed, crowding, and schedule timing into timely reminders that students actually hear through broadcast and robot display.

- "What is the strongest teacher benefit?"  
  Teaching service gives teachers attendance, focus signals, AI suggestions, and report evidence without forcing them to manually gather every detail.

- "How do we know the demo really completed?"  
  End on logs and report output: the judge can see the route, action, AI response, robot display event, and completion record.

## Closing Line

"Our robot turns everyday school needs into tasks that students can hear, teachers can trust, and the robot can execute. Even without connected hardware, the same AI, command, display, and log path stays visible for judging."

## Build

```powershell
node scripts/build-github-pages.mjs
```

The script writes the deployable site to `docs/`.

## GitHub Pages Setting

Set GitHub Pages source to:

- Branch: your deployed branch
- Folder: `/docs`

## Routes

- Portal: `/`
- App2: `/app2/`
- App2 Robot Display: `/app2/robot-display.html`
- App3: `/app3/`
- App3 Robot Display: `/app3/robot-display.html`

## Static Demo Behavior

The build enables:

- `VITE_STATIC_DEMO=1`
- `VITE_AI_PROXY_DISABLED=1`

Hardware, bridge, WebSocket, and proxy-only AI calls are replaced with browser-safe demo fallbacks. Camera and microphone still require the browser's permission prompt and work best on HTTPS, which GitHub Pages provides.

Use the GitHub Pages build for online practice and backup presentation. Use the local App2 dev/bridge setup for the full competition demo with live AI bridge, ROBOT display sync, and Arduino/serial support.
