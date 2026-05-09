let video;
let hands;

let detections = [];
let handedness = [];

let smoothLeft = { x: 0, y: 0 };
let smoothRight = { x: 0, y: 0 };
let lerpAmount = 0.5; // Dinaikkan untuk responsivitas yang lebih baik saat membuat frame

let puzzlePieces = [];
let selectedPiece = null;
let selectedPieceOffsetX = 0;
let selectedPieceOffsetY = 0;
let wasPinching = false;
let capturedFace;

const cols = 3;
const rows = 3;

// Hand connections for drawing skeleton
const handConnections = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17]
];

let frameX = 0, frameY = 0, frameW = 0, frameH = 0;
let frameStart = 0;
let lockedFrame = null;
let gameOver = false;

// Timer
let startTime = 0;
let endTime = 0;
let elapsedTime = 0;

// Confetti
let confettis = [];

// Pinch stability counters
let pinchIndexHold = 0;
let pinchIndexRelease = 0;

// Variabel confidence untuk masing-masing jenis pinch
let pinchMiddleConf = 0;
let pinchIndexConf = 0;

// Timer element
let timerElement;

// Kucing video
let kucingVideo;

function setup() {
    createCanvas(1280, 720);
    video = createCapture(VIDEO);
    video.size(width, height);
    video.hide();

    hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.1, // Lebih toleran untuk deteksi posisi tangan bawah
        minTrackingConfidence: 0.1   // Lebih toleran untuk tracking yang tidak sempurna
    });

    hands.onResults(onResults);

    const camera = new Camera(video.elt, {
        onFrame: async () => {
            await hands.send({ image: video.elt });
        },
        width: width,
        height: height
    });
    camera.start();

    // Select timer element
    timerElement = select('.timer');

    // Load kucing video
    kucingVideo = createVideo('assets/kucing_kicau.mp4');
    kucingVideo.hide();
    kucingVideo.volume(0); // Mute if needed
}

function onResults(results) {
    detections = results.multiHandLandmarks || [];
    handedness = results.multiHandedness || [];
}

function draw() {
    background(0);

    push();
    translate(width, 0);
    scale(-1, 1);
    image(video, 0, 0, width, height);
    pop();

    // // Title
    // fill(255);
    // textAlign(CENTER);
    // textSize(40);
    // text("Ulinan Nyusun", width / 2, 50);

    // Timer
    if (startTime > 0 && !gameOver) {
        elapsedTime = millis() - startTime;
    } else if (gameOver && endTime > 0) {
        elapsedTime = endTime - startTime;
    }
    let minutes = floor(elapsedTime / 60000);
    let seconds = floor((elapsedTime % 60000) / 1000);
    timerElement.html(`${nf(minutes, 2)}:${nf(seconds, 2)}`);

    let middlePinchActive = false;
    let indexPinchActive = false;
    let interactionX = 0;
    let interactionY = 0;
    let handSkeletons = [];

    if (detections.length > 0) {
        for (let i = 0; i < detections.length; i++) {
            let hand = detections[i];
            let thumb = hand[4];
            let index = hand[8];
            let middle = hand[12];

            // Draw hand skeleton
            let landmarks2D = hand.map(landmark => ({
                x: (1 - landmark.x) * width,
                y: landmark.y * height
            }));
            handSkeletons.push(landmarks2D);

            // 1. Cek Pinch Jari Tengah + Jempol (Trigger Puzzle)
            let dMiddle = dist(thumb.x, thumb.y, middle.x, middle.y);
            if (dMiddle < 0.05) pinchMiddleConf++;
            else pinchMiddleConf = 0;

            if (pinchMiddleConf > 5) {
                middlePinchActive = true;
                interactionX = (1 - middle.x) * width;
                interactionY = middle.y * height;
            }

            // 2. Cek Pinch Jari Telunjuk + Jempol (Pindah Kotak)
            let dIndex = dist(thumb.x, thumb.y, index.x, index.y);
            if (dIndex < 0.05) {
                pinchIndexConf++;
                pinchIndexHold++;
                pinchIndexRelease = 0;
            } else {
                pinchIndexConf = 0;
                pinchIndexHold = 0;
                pinchIndexRelease++;
            }

            if (pinchIndexConf > 5) {
                indexPinchActive = true;
                interactionX = (1 - index.x) * width;
                interactionY = index.y * height;
            }

            // Visual bantuan (hanya saat membuat frame)
            if (puzzlePieces.length === 0) {
                noStroke();
                fill(0, 255, 0); // Telunjuk: Hijau
                circle((1 - index.x) * width, index.y * height, 12);
                fill(255, 0, 255); // Jari Tengah: Ungu
                circle((1 - middle.x) * width, middle.y * height, 12);
            }
        }
    }

    // --- LOGIKA FRAME (Gunakan Telunjuk untuk Gambar, Tengah untuk Trigger) ---
    if (puzzlePieces.length === 0 && detections.length >= 2) {
        let leftHand, rightHand;
        for (let i = 0; i < detections.length; i++) {
            if (handedness[i]?.label === "Left") leftHand = detections[i];
            if (handedness[i]?.label === "Right") rightHand = detections[i];
        }

        if (leftHand && rightHand) {
            smoothLeft.x = lerp(smoothLeft.x, (1 - leftHand[8].x) * width, lerpAmount);
            smoothLeft.y = lerp(smoothLeft.y, leftHand[8].y * height, lerpAmount);
            smoothRight.x = lerp(smoothRight.x, (1 - rightHand[8].x) * width, lerpAmount);
            smoothRight.y = lerp(smoothRight.y, rightHand[8].y * height, lerpAmount);

            frameX = min(smoothLeft.x, smoothRight.x);
            frameY = min(smoothLeft.y, smoothRight.y);
            frameW = abs(smoothRight.x - smoothLeft.x);
            frameH = abs(smoothRight.y - smoothLeft.y);

            stroke(0, 255, 255);
            noFill();
            rect(frameX, frameY, frameW, frameH);

            if (frameW > 100 && frameH > 100) {
                if (frameStart === 0) frameStart = millis();
                if (millis() - frameStart > 200) {
                    fill(0, 255, 255, 100);
                    rect(frameX, frameY, frameW, frameH);

                    // TRIGGER FIXED: Menggunakan Pinch Jari Tengah
                    if (middlePinchActive && !wasPinching) {
                        lockedFrame = { x: frameX, y: frameY, w: frameW, h: frameH };
                        createPuzzleFromCamera();
                        startTime = millis(); // Start timer
                    }
                }
            } else { frameStart = 0; }
        }
    }

    // --- INTERAKSI PUZZLE (Gunakan Pinch Telunjuk) ---
    for (let piece of puzzlePieces) {
        if (piece !== selectedPiece) {
            image(piece.img, piece.x, piece.y, piece.w, piece.h);
            stroke(piece.currentGridX === piece.correctGridX && piece.currentGridY === piece.correctGridY ? color(0, 255, 0, 150) : color(255, 255, 255, 150));
            strokeWeight(3);
            noFill();
            rect(piece.x, piece.y, piece.w, piece.h);
        }
    }

    // Smooth movement for pieces
    for (let piece of puzzlePieces) {
        if (piece !== selectedPiece) {
            piece.x = lerp(piece.x, piece.targetX, 0.1);
            piece.y = lerp(piece.y, piece.targetY, 0.1);
        }
    }

    for (let skeleton of handSkeletons) {
        drawHandSkeleton(skeleton);
    }

    if (!gameOver) {
        if (indexPinchActive) {
            // Kunci kepingan hanya jika belum ada yang dibawa
            if (selectedPiece === null && !wasPinching && pinchIndexHold > 5) {
                for (let i = puzzlePieces.length - 1; i >= 0; i--) {
                    let p = puzzlePieces[i];
                    const grabMargin = 20;
                    if (interactionX > p.x - grabMargin && interactionX < p.x + p.w + grabMargin && interactionY > p.y - grabMargin && interactionY < p.y + p.h + grabMargin) {
                        selectedPiece = p;
                        selectedPieceOffsetX = interactionX - p.x;
                        selectedPieceOffsetY = interactionY - p.y;
                        break;
                    }
                }
            }

            if (selectedPiece) {
                selectedPiece.x = interactionX - selectedPieceOffsetX;
                selectedPiece.y = interactionY - selectedPieceOffsetY;
                image(selectedPiece.img, selectedPiece.x, selectedPiece.y, selectedPiece.w, selectedPiece.h);
                stroke(0, 255, 255);
                rect(selectedPiece.x, selectedPiece.y, selectedPiece.w, selectedPiece.h);
            }
        }
        else if (selectedPiece && pinchIndexRelease > 3) {
            // Swap saat pinch telunjuk dilepas
            executeSwap();
        }
    }    // Logika Game Over & Restart (Bisa menggunakan Pinch Tengah atau Telunjuk)
    if (gameOver) {
        drawGameOver(middlePinchActive || indexPinchActive, interactionX, interactionY);
    } else if (puzzlePieces.length > 0 && puzzlePieces.every(p => p.currentGridX === p.correctGridX && p.currentGridY === p.correctGridY)) {
        gameOver = true;
        endTime = millis(); // Stop timer
        createConfetti(); // Start confetti
        kucingVideo.play(); // Play kucing video
    }

    wasPinching = (middlePinchActive || indexPinchActive);

    // Overlay video semi-transparan agar tangan terlihat saat memindahkan objek
    if (puzzlePieces.length > 0) {
        push();
        translate(width, 0);
        scale(-1, 1);
        tint(255, 10); // Alpha 80 untuk transparan
        image(video, 0, 0, width, height);
        noTint();
        pop();
    }

    // Update and draw confetti
    for (let i = confettis.length - 1; i >= 0; i--) {
        let c = confettis[i];
        c.y += c.speed;
        c.x += c.dir;
        fill(c.color);
        noStroke();
        rect(c.x, c.y, c.size, c.size);
        if (c.y > height) {
            confettis.splice(i, 1);
        }
    }
}

function executeSwap() {
    let targetPiece = null;
    let minDist = Infinity;
    let centerX = selectedPiece.x + selectedPiece.w / 2;
    let centerY = selectedPiece.y + selectedPiece.h / 2;

    // Cari kepingan terdekat berdasarkan jarak center
    for (let p of puzzlePieces) {
        if (p !== selectedPiece) {
            let pCenterX = p.x + p.w / 2;
            let pCenterY = p.y + p.h / 2;
            let d = dist(centerX, centerY, pCenterX, pCenterY);
            if (d < minDist) {
                minDist = d;
                targetPiece = p;
            }
        }
    }

    // Jika jarak terlalu jauh, tidak swap
    if (targetPiece && minDist < selectedPiece.w / 2) {
        let oldTX = selectedPiece.targetX, oldTY = selectedPiece.targetY;
        let oldGX = selectedPiece.currentGridX, oldGY = selectedPiece.currentGridY;

        selectedPiece.targetX = targetPiece.targetX;
        selectedPiece.targetY = targetPiece.targetY;
        selectedPiece.currentGridX = targetPiece.currentGridX;
        selectedPiece.currentGridY = targetPiece.currentGridY;

        targetPiece.targetX = oldTX;
        targetPiece.targetY = oldTY;
        targetPiece.currentGridX = oldGX;
        targetPiece.currentGridY = oldGY;

        targetPiece.x = targetPiece.targetX;
        targetPiece.y = targetPiece.targetY;
    }
    selectedPiece = null;
}

function drawGameOver(isPinching, px, py) {
    fill(0, 0, 0, 150);
    rect(0, 0, width, height);

    // Draw kucing video with green screen removed
    let kucingImg = removeGreenScreen(kucingVideo);
    image(kucingImg, width / 2 - 150, height / 2 - 320, 300, 300);

    textAlign(CENTER);
    textSize(50);
    fill(0, 255, 0);
    text("RENGSE EUYYY!!!", width / 2, height / 2 - 80);

    // Tampilkan waktu selesai
    let minutes = floor(elapsedTime / 60000);
    let seconds = floor((elapsedTime % 60000) / 1000);
    textSize(30);
    fill(255, 255, 255);
    text(`Waktu Selesai: ${nf(minutes, 2)}:${nf(seconds, 2)}`, width / 2, height / 2 - 20);

    let btnW = 200, btnH = 60;
    let btnX = width / 2 - btnW / 2;
    let btnY = height / 2 + 10;
    fill(255);
    rect(btnX, btnY, btnW, btnH, 10);
    fill(0);
    textSize(24);
    textAlign(CENTER, CENTER);
    text("RESTART", btnX + btnW / 2, btnY + btnH / 2);

    if (isPinching && px > btnX && px < btnX + btnW && py > btnY && py < btnY + btnH) {
        resetGame();
    }
}

function createPuzzleFromCamera() {
    puzzlePieces = [];
    let cropX = video.width - lockedFrame.x - lockedFrame.w;
    capturedFace = video.get(int(cropX), int(lockedFrame.y), int(lockedFrame.w), int(lockedFrame.h));
    let pW = lockedFrame.w / cols, pH = lockedFrame.h / rows;
    let positions = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) positions.push({ x: x, y: y });
    }
    let shuffled = [...positions].sort(() => Math.random() - 0.5);
    let index = 0;
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            let imgPiece = capturedFace.get(x * (capturedFace.width / cols), y * (capturedFace.height / rows), capturedFace.width / cols, capturedFace.height / rows);
            let pos = shuffled[index];
            puzzlePieces.push({
                img: imgPiece, x: lockedFrame.x + pos.x * pW, y: lockedFrame.y + pos.y * pH,
                targetX: lockedFrame.x + pos.x * pW, targetY: lockedFrame.y + pos.y * pH,
                currentGridX: pos.x, currentGridY: pos.y, correctGridX: x, correctGridY: y, w: pW, h: pH
            });
            index++;
        }
    }
}

function resetGame() {
    puzzlePieces = [];
    selectedPiece = null;
    lockedFrame = null;
    gameOver = false;
    frameStart = 0;
    smoothLeft = { x: 0, y: 0 };
    smoothRight = { x: 0, y: 0 };
    startTime = 0;
    endTime = 0;
    elapsedTime = 0;
    confettis = [];
}

function createConfetti() {
    for (let i = 0; i < 100; i++) {
        confettis.push({
            x: random(width),
            y: random(-100, 0),
            speed: random(2, 5),
            dir: random(-2, 2),
            size: random(5, 10),
            color: color(random(255), random(255), random(255))
        });
    }
}

function drawHandSkeleton(points) {
    stroke(255);
    strokeWeight(2);
    for (let conn of handConnections) {
        let a = points[conn[0]];
        let b = points[conn[1]];
        if (a && b) {
            line(a.x, a.y, b.x, b.y);
        }
    }
    noStroke();
    fill(255);
    for (let point of points) {
        circle(point.x, point.y, 8);
    }
}

function removeGreenScreen(video) {
    video.loadPixels();
    let img = createImage(video.width, video.height);
    img.loadPixels();
    for (let i = 0; i < video.pixels.length; i += 4) {
        let r = video.pixels[i];
        let g = video.pixels[i + 1];
        let b = video.pixels[i + 2];
        // If green is significantly dominant
        if (g > 150 && g > r + 50 && g > b + 50) {
            img.pixels[i + 3] = 0; // Set alpha to 0
        } else {
            img.pixels[i] = r;
            img.pixels[i + 1] = g;
            img.pixels[i + 2] = b;
            img.pixels[i + 3] = 255;
        }
    }
    img.updatePixels();
    return img;
}