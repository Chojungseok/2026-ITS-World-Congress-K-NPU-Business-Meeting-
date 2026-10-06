// 일반 스크립트로 먼저 실행해 file:// 접근에도 빈 화면 대신 안내를 표시합니다.
const startupTitle = document.getElementById('startup-title');
const startupMessage = document.getElementById('startup-message');
const localHelp = document.getElementById('local-file-help');
if (location.protocol === 'file:') {
  startupTitle.textContent = '로컬 실행 파일로 시작해 주세요';
  startupMessage.textContent = '이 페이지는 로컬 서버를 통해 열어야 합니다. 같은 폴더의 start-local.cmd 파일을 더블클릭하면 서버와 브라우저가 함께 열립니다.';
  localHelp.hidden = false;
} else {
  import('./app.js').catch(error => {
    console.error('K-NPU startup failed:', error);
    const panel = document.createElement('section');
    panel.className = 'startup-panel';
    const title = document.createElement('h1');
    title.textContent = '화면을 불러오지 못했습니다';
    const message = document.createElement('p');
    message.textContent = '브라우저를 새로고침해 주세요. 문제가 계속되면 로컬 실행 창을 확인해 주세요.';
    const retry = document.createElement('button');
    retry.className = 'button primary';
    retry.textContent = '새로고침';
    retry.addEventListener('click', () => location.reload());
    panel.append(title, message, retry);
    document.getElementById('app').replaceChildren(panel);
  });
}
