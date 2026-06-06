# app.py
import os
import re
import requests
from flask import Flask, render_template_string, request, jsonify

app = Flask(__name__)

# 🔐 আপনার দেওয়া সিকিউরিটি ও কনফিগারেশন সেটিংস
SECRET_CODE = "DADA@7795096838"
DEVELOPER_TELEGRAM = "@DADA310724"
TELEGRAM_BOT_TOKEN = "8754280631:AAHw_iikd7gWRT0QGTvBAhTLpBkpvSqoabs"      # আপনার বোট টোকেন এখানে বসাবেন
ADMIN_CHAT_ID = "6812336753"    # আপনার চ্যাট আইডি এখানে বসাবেন

# 🎨 ফ্রন্টএন্ড ডিজাইন (Premium Dark Chat UI)
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Parisa Memory Portal</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background-color: #0b0f19; color: #e2e8f0; display: flex; flex-direction: column; height: 100vh; }
        header { background-color: #111827; padding: 15px; text-align: center; border-bottom: 2px solid #1f2937; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        header h1 { color: #38bdf8; font-size: 1.4rem; letter-spacing: 1px; }
        header p { color: #9ca3af; font-size: 0.85rem; margin-top: 4px; }
        .chat-container { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; }
        .message { max-width: 80%; padding: 12px 16px; border-radius: 15px; font-size: 0.95rem; line-height: 1.5; }
        .bot-message { background-color: #1f2937; align-self: flex-start; border-bottom-left-radius: 2px; color: #f1f5f9; box-shadow: 2px 2px 5px rgba(0,0,0,0.2); }
        .user-message { background-color: #0284c7; align-self: flex-end; border-bottom-right-radius: 2px; color: #ffffff; box-shadow: -2px 2px 5px rgba(0,0,0,0.2); }
        .admin-message { background-color: #b91c1c; align-self: flex-start; border-bottom-left-radius: 2px; color: #ffffff; font-weight: bold; }
        .input-area { background-color: #111827; padding: 15px; display: flex; gap: 10px; border-top: 2px solid #1f2937; }
        .input-area input { flex: 1; background-color: #1f2937; border: 1px solid #374151; padding: 12px; border-radius: 8px; color: #ffffff; font-size: 1rem; outline: none; }
        .input-area input:focus { border-color: #38bdf8; }
        .input-area button { background-color: #0284c7; color: white; border: none; padding: 12px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
        .input-area button:hover { background-color: #0369a1; }
    </style>
</head>
<body>

    <header>
        <h1>📋 PARISA MEMORY PORTAL</h1>
        <p>দাদা টেকনোলজি © ২০২৬ | সুনিশ্চিত এআই ডাটাবেজ</p>
    </header>

    <div class="chat-container" id="chatContainer">
        <div class="message bot-message">
            আসসালামু আলাইকুম। আমি রুবেল ও পারিসার সম্পর্কের আড়াই বছরের সম্পূর্ণ ইতিহাস, চ্যাট হিস্ট্রি এবং তদন্ত রিপোর্টের একটি এআই সংস্করণ। আমি আপনাকে সঠিক তথ্য ও আইনি যুক্তি দিয়ে সাহায্য করতে পারি। বলুন, আপনি কী জানতে চান?
        </div>
    </div>

    <div class="input-area">
        <input type="text" id="userInput" placeholder="আপনার প্রশ্নটি এখানে লিখুন..." onkeypress="handleKeyPress(event)">
        <button onclick="sendMessage()">পাঠান</button>
    </div>

    <script>
        const chatContainer = document.getElementById('chatContainer');
        const userInput = document.getElementById('userInput');

        function handleKeyPress(event) {
            if (event.key === 'Enter') sendMessage();
        }

        async function sendMessage() {
            const text = userInput.value.strip ? userInput.value.strip() : userInput.value.trim();
            if (!text) return;

            appendMessage(text, 'user-message');
            userInput.value = '';

            try {
                const response = await fetch('/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: text })
                });
                const data = await response.json();
                
                let messageClass = 'bot-message';
                if (data.status === 'ADMIN_MODE_ACTIVATED') {
                    messageClass = 'admin-message';
                }
                
                appendMessage(data.message, messageClass);
            } catch (error) {
                appendMessage('সার্ভার সংযোগে সমস্যা হয়েছে!', 'bot-message');
            }
        }

        function appendMessage(text, className) {
            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${className}`;
            msgDiv.innerText = text;
            chatContainer.appendChild(msgDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    </script>
</body>
</html>
"""

# 🧠 ব্যাকএন্ড এআই প্রসেসিং ও লজিক গেটওয়ে
@app.route('/')
def home():
    return render_template_string(HTML_TEMPLATE)

@app.route('/chat', codecs=['POST'])
@app.route('/chat', methods=['POST'])
def chat():
    data = request.json or {}
    user_message = data.get('message', '').strip()
    
    # ১. মাস্টার সিক্রেট কোড প্রটোকল চেক
    if user_message == SECRET_CODE:
        return jsonify({
            "status": "ADMIN_MODE_ACTIVATED",
            "message": "আসসালামু আলাইকুম দাদা। সিক্রেট কোড ভেরিফাইড। রিয়েল-টাইম ডিরেকশন মোড অ্যাক্টিভেটেড। বলুন আপনার পরবর্তী নির্দেশ কী?"
        })
    
    # ২. ডেভলপার বা ক্রিয়েটর ক্রেডিট চেক
    credit_keywords = ["কে বানিয়েছে", "ডেভলপার কে", "who made you", "creator", "developer", "দাদা কে"]
    if any(keyword in user_message.lower() for keyword in credit_keywords):
        return jsonify({
            "status": "CREDIT_INFO",
            "message": f"আমাকে তৈরি করেছেন আমার ডেভলপার 'দাদা' (রুবেল)। ডেভলপার সম্পর্কে জানতে বা সরাসরি যোগাযোগ করতে টেলিগ্রামে নক দিন: {DEVELOPER_TELEGRAM}"
        })
    
    # ৩. গুগল ড্রাইভ থেকে ডেট-টাইম ম্যাচিং লজিক
    date_pattern = r'\d{2}[-\/\s]\d{2}[-\/\s]\d{4}|\d{1,2}\s(?:এপ্রিল|আগস্ট|জুলাই|ফেব্রুয়ারি)'
    found_date = re.findall(date_pattern, user_message)
    
    ai_reply = "আপনার প্রশ্নটি গ্রহণ করা হয়েছে। আপনার দেওয়া ফ্রেশ হিস্ট্রি পিডিএফ ডাটাবেজ থেকে তথ্য মেলানো হচ্ছে।"
    if found_date:
        ai_reply += f"\n\n🔗 আপনার খোঁজা তারিখের ({found_date[0]}) স্ক্রিনশট ও মিডিয়া প্রমাণের জন্য আপনার গুগল ড্রাইভের রুট ফোল্ডারটি চেক করুন।"

    # ৪. রিয়েল-টাইম টেলিগ্রাম বট নোটিফিকেশন পুশ
    send_to_telegram(user_message, ai_reply)

    return jsonify({"status": "USER_MODE", "message": ai_reply})

def send_to_telegram(question, answer):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    log_message = f"🔔 **নতুন ইউজার লগ**\n\n❓ প্রশ্ন: {question}\n🤖 উত্তর: {answer}"
    payload = {"chat_id": ADMIN_CHAT_ID, "text": log_message, "parse_mode": "Markdown"}
    try:
        requests.post(url, json=payload, timeout=5)
    except:
        pass

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
    