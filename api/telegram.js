module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      // Перенаправляем запрос в основной API
      const apiResponse = await fetch('https://YOUR_VERCEL_URL/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...req.body,
          platform: 'telegram'
        })
      });
      
      const data = await apiResponse.json();
      res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ error: "Telegram bot error" });
    }
  } else {
    res.status(405).end();
  }
};
