// Drive the WeChat DevTools mini-game automator: launch our project and
// dump every incoming message (console errors, events) to stdout.
//   node minigame/tests/automator.mjs <port>
const port = process.argv[2] || '42352';

const projectPath = 'C:\\Projects\\FishGame\\minigame';

const ws = new WebSocket('ws://127.0.0.1:' + port);
let launched = false;

function send(action, params) {
  ws.send(JSON.stringify({ action, params }));
}

ws.onopen = () => {
  console.log('[ws] connected to ' + port);
  send('launchProject', {
    projectPath,
    projectConfig: {
      appid: 'wxdbc3429dae591e19',
      projectname: 'yugan-game',
      setting: {
        es6: true,
        urlCheck: false,
        minified: false,
        compileHotReLoad: true,
      },
    },
  });
  console.log('[send] launchProject');
};

ws.onmessage = (e) => {
  let data = e.data;
  let text = typeof data === 'string' ? data : String(data);
  try {
    const j = JSON.parse(text);
    if (j.event === 'console' || j.event === 'log' || j.event === 'error') {
      console.log('[console]', JSON.stringify(j));
    } else if (j.event === 'launchProject') {
      console.log('[launchProject]', JSON.stringify(j).slice(0, 500));
      launched = true;
    } else {
      console.log('[event]', text.slice(0, 500));
    }
  } catch (err) {
    console.log('[raw]', text.slice(0, 500));
  }
};

ws.onerror = (e) => console.log('[ws error]', String(e));
ws.onclose = (e) => {
  console.log('[ws closed]', e.code, e.reason);
  process.exit(0);
};

setTimeout(() => {
  console.log('[timeout] giving up after 25s');
  try { ws.close(); } catch (e) {}
  process.exit(0);
}, 25000);