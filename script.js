document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const cvInput = document.getElementById('cvText');
    const jobInput = document.getElementById('jobText');
    const langSelect = document.getElementById('langSelect');
    const generateBtn = document.getElementById('generateBtn');
    const btnText = document.querySelector('.btn-text');
    const btnLoader = document.getElementById('btnLoader');
    const outputArea = document.getElementById('outputArea');
    const copyBtn = document.getElementById('copyBtn');
    const toast = document.getElementById('toast');

    if(localStorage.getItem('ai_cover_apiKey')) apiKeyInput.value = localStorage.getItem('ai_cover_apiKey');
    if(localStorage.getItem('ai_cover_cv')) cvInput.value = localStorage.getItem('ai_cover_cv');

    apiKeyInput.addEventListener('input', () => localStorage.setItem('ai_cover_apiKey', apiKeyInput.value.trim()));
    cvInput.addEventListener('input', () => localStorage.setItem('ai_cover_cv', cvInput.value));

    let currentCoverLetter = "";

    generateBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        const cvText = cvInput.value.trim();
        const jobText = jobInput.value.trim();
        const lang = langSelect.value;

        if (!apiKey) {
            alert("Lütfen geçerli bir Gemini API anahtarı girin.\n(Google AI Studio üzerinden ücretsiz alabilirsiniz)");
            return;
        }
        if (!cvText || !jobText) {
            alert("Lütfen özgeçmiş/yetenekler alanını ve hedef iş ilanı açıklamasını doldurun.");
            return;
        }

        generateBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoader.style.display = 'block';
        outputArea.innerHTML = `
            <div class="placeholder-container">
                <div class="icon">⏳</div>
                <p class="placeholder-text" style="color: #cbd5e1;">Yapay zeka detayları analiz edip, mükemmel ön yazıyı kurguluyor...<br>Lütfen bekleyin (5-10 saniye sürebilir).</p>
            </div>`;
        copyBtn.disabled = true;

        const prompt = `Sen üst düzey bir Kariyer Koçu ve İnsan Kaynakları Uzmanısın. İş arayan bir adayın özgeçmişini ve başvurmak istediği iş ilanının tanımını sana vereceğim. Görevin, adayın yetenekleri ile ilanın gereksinimlerini en pürüzsüz ve ikna edici şekilde eşleştiren, profesyonel, akıcı ve çok uzun olmayan net bir Ön Yazı (Cover Letter) oluşturmaktır.

Adayın Özgeçmiş Özeti / Yetenekleri:
${cvText}

Başvurulacak İş İlanı Açıklaması:
${jobText}

Katı Kurallar:
1. Ön yazının dili kesinlikle "${lang}" olmalıdır.
2. Sadece ve sadece ön yazıyı üret.
3. ÇOK AMA ÇOK KISA OLSUN! Maksimum 2 kısa paragraf ve toplamda en fazla 4-5 cümleden oluşsun.
4. KLASİK MEKTUP BAŞLIKLARINI KALDIR!
5. CV'de olmayan uydurma tecrübeler ekleme.`;

        const generateLetter = async (retryWait = 0) => {
            if (retryWait > 0) {
                 outputArea.innerHTML = `
                    <div class="placeholder-container">
                        <div class="icon" style="font-size: 2rem;">⏳</div>
                        <p class="placeholder-text" style="color: #cbd5e1; margin-bottom: 0.5rem; line-height: 1.5;">Çok fazla istek atıldı. (API Zaman Aşımı Koruması)</p>
                        <p style="color: #fca5a5; font-weight: bold; margin-top: 0;">Sistem <span id="waitSecs">${retryWait}</span> saniye sonra otomatik tekrar deneyecek...</p>
                    </div>`;
                 
                 for (let i = retryWait; i > 0; i--) {
                     const waitEl = document.getElementById('waitSecs');
                     if (waitEl) waitEl.innerText = i;
                     await new Promise(r => setTimeout(r, 1000));
                 }
                 
                 outputArea.innerHTML = `
                    <div class="placeholder-container">
                        <div class="icon">🔄</div>
                        <p class="placeholder-text" style="color: #cbd5e1;">Bekleme süresi doldu, yeniden deneniyor...</p>
                    </div>`;
            }

            const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            let targetModel = "gemini-2.5-flash"; 

            if (modelsResponse.ok) {
                const modelsData = await modelsResponse.json();
                if (modelsData.models && Array.isArray(modelsData.models)) {
                    const validModel = modelsData.models.find(m => 
                        m.supportedGenerationMethods && 
                        m.supportedGenerationMethods.includes('generateContent') && 
                        m.name.includes('gemini')
                    );
                    if (validModel) {
                        targetModel = validModel.name.replace('models/', '');
                    }
                }
            } else {
                 const errData = await modelsResponse.json().catch(() => ({}));
                 const lowerErr = (errData.error?.message || '').toLowerCase();
                 if (errData.error?.code === 429 || lowerErr.includes("quota") || lowerErr.includes("rate limit")) {
                      if (retryWait === 0) {
                          const retryMatch = errData.error?.message?.match(/retry in ([\d\.]+)s/i);
                          const waitTime = retryMatch && retryMatch[1] ? Math.ceil(parseFloat(retryMatch[1])) + 2 : 60;
                          return generateLetter(waitTime);
                      }
                 }
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6 } })
            });

            const data = await response.json();

            if (!response.ok) {
                if(data.error?.code === 400 && data.error?.message.includes("API key")) throw new Error("Geçersiz API Anahtarı. Lütfen kontrol edip tekrar deneyin.");
                let errorMsg = data.error?.message || 'Gemini API ile iletişimde bir hata oluştu.';
                const lowerMsg = errorMsg.toLowerCase();
                if (lowerMsg.includes("high demand") || lowerMsg.includes("overloaded")) throw new Error("Google Gemini sunucuları şu anda çok yoğun. Lütfen birkaç dakika bekleyin.");
                else if (lowerMsg.includes("quota") || lowerMsg.includes("rate limit") || data.error?.code === 429) {
                    if (retryWait === 0) {
                        const retryMatch = data.error?.message?.match(/retry in ([\d\.]+)s/i);
                        return generateLetter(retryMatch && retryMatch[1] ? Math.ceil(parseFloat(retryMatch[1])) + 2 : 60);
                    } else throw new Error("Otomatik bekleme sonrası limit hatası. API kotanızı kontrol edin.");
                }
                throw new Error(errorMsg);
            }
            return data;
        };

        try {
            const data = await generateLetter();
            const generatedText = data.candidates[0].content.parts[0].text;
            currentCoverLetter = generatedText;
            
            if (typeof marked !== 'undefined') outputArea.innerHTML = marked.parse(generatedText);
            else outputArea.innerHTML = `<p style="white-space: pre-wrap">${generatedText.replace(/\\n/g, '<br>')}</p>`;

            copyBtn.disabled = false;
        } catch (error) {
            outputArea.innerHTML = `
                <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 1.5rem; border-radius: 12px; margin-top: 1rem;">
                    <h3 style="color: #f87171; margin-bottom: 0.5rem; margin-top: 0;">⚠️ Bir Hata Oluştu</h3>
                    <p style="color: #fca5a5;">${error.message}</p>
                </div>`;
        } finally {
            generateBtn.disabled = false;
            btnText.style.display = 'block';
            btnLoader.style.display = 'none';
        }
    });

    copyBtn.addEventListener('click', () => {
        if (!currentCoverLetter) return;
        navigator.clipboard.writeText(currentCoverLetter).then(() => {
            toast.classList.add('show');
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = 'Kopyalandı! ✔️';
            copyBtn.style.cssText = 'background-color: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #10b981;';
            setTimeout(() => {
                toast.classList.remove('show');
                copyBtn.innerHTML = originalText;
                copyBtn.style.cssText = '';
            }, 2500);
        }).catch(() => alert("Metin kopyalanamadı, lütfen manuel olarak seçip kopyalayın."));
    });
});
