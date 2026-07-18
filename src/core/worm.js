function initWorm() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
        canvas.width = window.innerWidth * window.devicePixelRatio;
        canvas.height = window.innerHeight * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    let wormX = window.innerWidth / 2;
    let wormY = window.innerHeight / 2 + 50;
    let targetX = wormX;
    let targetY = wormY;
    let animTime = 0;
    let blinkTimer = 0;
    let isBlinking = false;

    setInterval(() => {
        targetX = (window.innerWidth * 0.2) + Math.random() * (window.innerWidth * 0.6);
        targetY = (window.innerHeight * 0.4) + Math.random() * (window.innerHeight * 0.3);
    }, 3000);

    function drawWorm() {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        animTime += 0.05;
        blinkTimer += 1;

        if (blinkTimer > 120) {
            isBlinking = true;
            if (blinkTimer > 130) { isBlinking = false; blinkTimer = 0; }
        }

        wormX += (targetX - wormX) * 0.02;
        wormY += (targetY - wormY) * 0.02;
        const wave = Math.sin(animTime) * 8;
        
        ctx.save();
        ctx.translate(wormX, wormY);

        for (let i = 6; i > 0; i--) {
            const segX = -i * 18;
            const segY = Math.sin(animTime + i * 0.6) * 12 + (i * 4);
            ctx.beginPath();
            ctx.arc(segX, segY, 25 - (i * 2), 0, Math.PI * 2);
            ctx.fillStyle = `hsl(340, ${60 - i * 4}%, ${50 - i * 2}%)`;
            ctx.fill();
            ctx.strokeStyle = '#4a1220';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(0, wave, 40, 0, Math.PI * 2);
        ctx.fillStyle = '#ffb6c1';
        ctx.fill();
        ctx.strokeStyle = '#e07b8d';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-25, wave - 25); ctx.lineTo(-40, wave - 50); ctx.lineTo(-10, wave - 35);
        ctx.closePath(); ctx.fillStyle = '#ffb6c1'; ctx.fill(); ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(15, wave - 30); ctx.lineTo(25, wave - 55); ctx.lineTo(30, wave - 20);
        ctx.closePath(); ctx.fillStyle = '#ffa0b4'; ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(-15, wave - 10, 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(15, wave - 10, 8, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#000000';
        if (!isBlinking) {
            ctx.beginPath(); ctx.arc(-14, wave - 10, 4, 0, Math.PI * 2);
            ctx.arc(16, wave - 10, 4, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.beginPath();
            ctx.moveTo(-22, wave - 10); ctx.lineTo(-8, wave - 10);
            ctx.moveTo(8, wave - 10); ctx.lineTo(22, wave - 10); 
            ctx.stroke();
        }

        ctx.beginPath(); ctx.ellipse(0, wave + 10, 16, 12, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ff8093'; ctx.fill(); ctx.strokeStyle = '#d6566b'; ctx.lineWidth = 2; ctx.stroke();

        ctx.fillStyle = '#631d27';
        ctx.beginPath(); ctx.arc(-5, wave + 10, 3, 0, Math.PI * 2);
        ctx.arc(5, wave + 10, 3, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
        requestAnimationFrame(drawWorm);
    }

    drawWorm();
}
