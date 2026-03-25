
const { GoogleGenerativeAI } = require('@google/generative-ai');

// The user's new key that they put in index.js
const GEMINI_API_KEY = "AIzaSyBr_O5leZdYkCOoqhP4IrwHdEHvfp4WxvA";

async function run() {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-pro",
  });

  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: "hi" }] },
      { role: "model", parts: [{ text: "hello. I am ready." }] }
    ]
  });

  try {
    const result = await chat.sendMessage("what");
    console.log(await result.response.text());
  } catch (e) {
    console.error("ERROR:");
    console.error(e);
  }
}

run();
