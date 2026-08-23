const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

app.get('/get-stream', async (req, res) => {
  const targetUrl = req.query.url;
  const epNum = req.query.ep || '1';

  if (!targetUrl) {
    return res.status(400).json({ error: 'Липсва url параметър' });
  }

  console.log(`[+] Сканиране за: ${targetUrl} (Епизод ${epNum})`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    let m3u8Url = null;

    // Прихващаме мрежовия поток по всяко време
    page.on('request', req => {
      const u = req.url();
      if ((u.includes('.m3u8') || u.includes('.ts')) && !m3u8Url) {
        m3u8Url = u;
        console.log('[!] Намерен видео поток в мрежата:', m3u8Url);
      }
    });

    // 1. Зареждаме страницата на сериала
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // 2. Намираме и кликваме върху бутона за съответния епизод
    console.log(`[+] Търсене и клик на бутон за Епизод ${epNum}...`);
    const clicked = await page.evaluate((ep) => {
      const elements = Array.from(document.querySelectorAll('div, a, span'));
      const targetEl = elements.find(el => el.textContent.trim() === ep || el.textContent.trim() === '0' + ep);
      if (targetEl) {
        targetEl.click();
        return true;
      }
      return false;
    }, epNum);

    if (!clicked) {
      await browser.close();
      return res.status(404).json({ success: false, error: `Не е намерен бутон за епизод ${epNum}.` });
    }

    // 3. Изчакваме малко за обновяване на плейъра след смяна на епизода
    await new Promise(r => setTimeout(r, 2000));

    // 4. Намираме и кликваме директно върху HTML бутона за Play (icon_play / container_play)
    console.log('[+] Търсене и клик на Play бутона в страницата...');
    await page.evaluate(() => {
      const playBtn = document.querySelector('.icon_play') || 
                      document.querySelector('.container_play') || 
                      document.querySelector('.pmovie_player_labs_block') ||
                      document.querySelector('div[class*="play"]');
      if (playBtn) {
        playBtn.click();
      }
    });

    // 5. Проверяваме мрежата и рамките за .m3u8 в следващите 10 секунди
    let checks = 0;
    while (!m3u8Url && checks < 20) {
      checks++;
      await new Promise(r => setTimeout(r, 500));

      try {
        const frames = page.frames();
        for (const frame of frames) {
          const fUrl = frame.url();
          if (fUrl && !fUrl.includes('filmizip.com')) {
            const html = await frame.content();
            const match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
            if (match) {
              m3u8Url = match[0];
              console.log('[!] Успешно намерен .m3u8 в iframe:', m3u8Url);
              break;
            }
          }
        }
      } catch (err) {}
    }

    await browser.close();

    if (m3u8Url) {
      return res.json({ success: true, episode: epNum, streamUrl: m3u8Url });
    } else {
      return res.status(404).json({ success: false, error: 'След клик върху плейъра не бе открит .m3u8 поток.' });
    }

  } catch (error) {
    if (browser) await browser.close();
    console.error('[-] Грешка:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 ТВ Бекенд сървърът работи на http://localhost:${PORT}`);
});
