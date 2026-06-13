import asyncio
import edge_tts
import os

async def indian_bangla_test():
    গল্প = (
        "নমস্কার রুবেল। আমি মাইক্রোসফটের ইন্ডিয়ান বাংলা ভয়েস ভাস্কর। "
        "তোমার ড্যাশবোর্ড এবং মেমোরি পোর্টালের জন্য এই কণ্ঠটি কেমন শোনাচ্ছে দেখো। "
        "তুমি চাইলে এই কণ্ঠটিকেও তোমার প্রজেক্টের ব্যাকএন্ডে খুব সহজেই ব্যবহার করতে পারো।"
    )
    
    # ১. ইন্ডিয়ান বাংলা ছেলের কণ্ঠ
    print("ভাস্করের কণ্ঠে ইন্ডিয়ান বাংলা তৈরি হচ্ছে...")
    await edge_tts.Communicate(গল্প, "bn-IN-BashkarNeural").save("indian_male.mp3")
    os.system("cp indian_male.mp3 /sdcard/")
    
if __name__ == "__main__":
    asyncio.run(indian_bangla_test())
