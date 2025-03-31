<div class="t-gpt-container" style="
  position: fixed;
  bottom: 30px;
  right: 30px;
  z-index: 1000;
  font-family: 'TT Commons', Arial, sans-serif;
">
  <!-- Кнопка открытия чата -->
  <div id="t-gpt-button" style="
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: #6E48AA;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    transition: all 0.3s ease;
  ">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>

  <!-- Окно чата -->
  <div id="t-gpt-chat" style="
    width: 350px;
    height: 500px;
    background: white;
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.15);
    display: none;
    flex-direction: column;
    overflow: hidden;
  ">
    <!-- Заголовок -->
    <div style="
      background: linear-gradient(135deg, #6E48AA 0%, #9F50AC 100%);
      color: white;
      padding: 18px 20px;
      font-size: 18px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
    ">
      <span>София · Эксперт 44-ФЗ</span>
      <div id="t-gpt-close" style="cursor: pointer;">✕</div>
    </div>

    <!-- История сообщений -->
    <div id="t-gpt-messages" style="
      flex-grow: 1;
      padding: 20px;
      overflow-y: auto;
      background: #FAFAFA;
    "></div>

    <!-- Поле ввода -->
    <div style="
      padding: 15px;
      border-top: 1px solid #EEE;
      background: white;
      display: flex;
      gap: 10px;
    ">
      <input id="t-gpt-input" type="text" placeholder="Напишите вопрос о госзакупках..." style="
        flex-grow: 1;
        padding: 12px 15px;
        border: 1px solid #DDD;
        border-radius: 8px;
        outline: none;
        font-size: 14px;
      ">
      <button id="t-gpt-send" style="
        background: #6E48AA;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 0 20px;
        cursor: pointer;
        transition: background 0.2s;
      ">Отправить</button>
    </div>
  </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
  // Элементы интерфейса
  const chatButton = document.getElementById('t-gpt-button');
  const chatWindow = document.getElementById('t-gpt-chat');
  const closeButton = document.getElementById('t-gpt-close');
  const sendButton = document.getElementById('t-gpt-send');
  const inputField = document.getElementById('t-gpt-input');
  const messagesContainer = document.getElementById('t-gpt-messages');

  // Приветственное сообщение
  const welcomeMessage = "👋 Здравствуйте! Я — София, эксперт по госзакупкам 44-ФЗ. Отвечаю на вопросы, объясняю нюансы. С чего начнём?";

  // Открытие/закрытие чата
  chatButton.addEventListener('click', function() {
    chatWindow.style.display = 'flex';
    chatButton.style.display = 'none';
    if (messagesContainer.children.length === 0) {
      addMessage('assistant', welcomeMessage);
    }
  });

  closeButton.addEventListener('click', function() {
    chatWindow.style.display = 'none';
    chatButton.style.display = 'flex';
  });

  // Отправка сообщения
  async function sendMessage() {
    const message = inputField.value.trim();
    if (!message) return;

    addMessage('user', message);
    inputField.value = '';
    
    try {
      const loadingId = addLoadingIndicator();
      
      const response = await fetch('https://tilda-gpt.vercel.app/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message })
      });
      
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      
      const data = await response.json();
      removeLoadingIndicator(loadingId);
      addMessage('assistant', data.reply);
      
    } catch (error) {
      console.error('Ошибка:', error);
      addMessage('assistant', '🔍 София временно недоступна. Попробуйте задать вопрос позже.');
    }
  }

  // Вспомогательные функции
  function addMessage(role, text) {
    const messageElement = document.createElement('div');
    messageElement.innerHTML = `
      <div style="
        margin-bottom: 15px;
        display: flex;
        flex-direction: ${role === 'user' ? 'row-reverse' : 'row'};
      ">
        <div style="
          max-width: 80%;
          padding: 12px 16px;
          border-radius: ${role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0'};
          background: ${role === 'user' ? '#6E48AA' : '#EEE'};
          color: ${role === 'user' ? 'white' : '#333'};
          word-break: break-word;
          line-height: 1.5;
        ">
          ${text}
        </div>
      </div>
    `;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function addLoadingIndicator() {
    const id = 'loading-' + Date.now();
    const loader = document.createElement('div');
    loader.id = id;
    loader.innerHTML = `
      <div style="display: flex; margin-bottom: 15px;">
        <div style="
          width: 40px;
          height: 40px;
          padding: 8px;
        ">
          <div style="
            width: 24px;
            height: 24px;
            border: 2px solid #6E48AA;
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s linear infinite;
          "></div>
        </div>
        <div style="
          padding: 8px 0;
          color: #666;
          font-size: 14px;
        ">София печатает...</div>
      </div>
    `;
    messagesContainer.appendChild(loader);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return id;
  }

  function removeLoadingIndicator(id) {
    const element = document.getElementById(id);
    if (element) element.remove();
  }

  // Отправка по кнопке и Enter
  sendButton.addEventListener('click', sendMessage);
  inputField.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') sendMessage();
  });
});
</script>

<style>
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
