(function() {
  // Get script parameters
  const script = document.currentScript;
  if (!script) return;

  const urlParams = new URLSearchParams(script.src.split('?')[1]);
  const trackingId = urlParams.get('id');

  if (!trackingId) {
    console.error('PaymentBlack Tracking: Missing tracking ID');
    return;
  }

  // Configuration
  const scriptUrl = new URL(script.src);
  const BASE_URL = scriptUrl.origin;
  
  // Helper to send events
  async function sendEvent(eventType, metadata = {}) {
    const params = new URLSearchParams(window.location.search);
    try {
      const response = await fetch(`${BASE_URL}/functions/v1/track-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackingId: trackingId,
          eventType: eventType,
          url: window.location.href,
          referrer: document.referrer,
          campaignId: params.get('utm_campaign'),
          adId: params.get('utm_id') || params.get('fbclid'),
          source: params.get('utm_source'),
          medium: params.get('utm_medium'),
          metadata: metadata
        })
      });
      
      return await response.json();
    } catch (e) {
      // Silently fail in production
    }
  }

  // 1. Record Visit
  sendEvent('visit');

  // 2. Quiz Tracking Helpers
  // Auto-detect quiz elements
  function trackQuiz() {
    // Look for common quiz button patterns or explicit markers
    const quizStartButtons = document.querySelectorAll('.quiz-start, [data-quiz-start]');
    quizStartButtons.forEach(btn => {
      btn.addEventListener('click', () => sendEvent('quiz_start'));
    });

    const quizOptions = document.querySelectorAll('.quiz-option, [data-quiz-option], .quiz-next');
    quizOptions.forEach(btn => {
      btn.addEventListener('click', () => {
        const step = btn.getAttribute('data-quiz-step') || 'progress';
        sendEvent('quiz_progress', { step: step });
      });
    });

    const quizFinalButtons = document.querySelectorAll('.quiz-finish, [data-quiz-finish]');
    quizFinalButtons.forEach(btn => {
      btn.addEventListener('click', () => sendEvent('quiz_complete'));
    });
  }
  
  trackQuiz();

  // 3. Capture Clicks on Checkout Buttons
  document.addEventListener('click', function(e) {
    const target = e.target.closest('a');
    if (target) {
      const isCheckoutLink = target.href.includes('/p/') || 
                             target.getAttribute('data-checkout') || 
                             target.classList.contains('checkout-btn');
      
      if (isCheckoutLink) {
        sendEvent('click', { targetUrl: target.href });
        
        // Append tracking ID to URL if it's a checkout link
        try {
          const url = new URL(target.href);
          url.searchParams.set('tp_id', trackingId);
          target.href = url.toString();
        } catch(err) {}
      }
    }
  });

})();