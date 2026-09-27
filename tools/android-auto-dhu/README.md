# Test Android Auto without a car (DHU)

The **Desktop Head Unit** mirrors a car screen on your PC.

1. **Install the DHU (once)** — Android Studio → SDK Manager → *SDK Tools* →
   tick **Android Auto Desktop Head Unit Emulator** → Apply.
2. **Prepare the phone (once)**
   - Open Android Auto at least once.
   - Enable its developer menu: Android Auto settings → *About* → tap the title 10×.
   - Menu ⋮ → **Start head unit server**.
   - Enable **USB debugging** and plug the phone in.
3. **Run** `start-dhu.bat` — it forwards port 5277 and opens the DHU.
   Pick **SUNODLAA** in the DHU launcher.
