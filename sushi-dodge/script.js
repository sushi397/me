import * as THREE from 'three';

// --- Constants ---
const LANE_COUNT = 4;
const LANE_WIDTH = 4; // 3D空間上のレーン幅
const START_Z = -80;  // 寿司が生成される奥のZ座標
const PLAYER_Z = 10;  // プレイヤーのZ座標（手前固定）
const DESPAWN_Z = 20; // カメラ後ろで消滅するZ座標

// --- Game State ---
let currentLane = 1; // 0, 1, 2, 3 のいずれか
let score = 0;
let gameActive = false;
let currentSpeed = 40; // z軸方向の移動速度 (units per second)
let speedMultiplier = 1.0;
let spawnTimer = 0;
let spawnInterval = 0.8; // 秒

// レベル別の設定値
let currentLevel = 2;
// 起動時に進行データをリセット
localStorage.setItem('sushi_unlocked_level', 1);
let unlockedLevel = 1;
let doubleSpawnChance = 0.1;
let shoyuChance = 0.02;

// --- Arrays ---
let sushis = [];
let floorLines = [];
let shoyuEffects = []; // 醤油エフェクトの配列 { lane, timer, mesh }

// --- Three.js Setup ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

// 背景色とフォグ（薄暗い和風の店内風）
const darkWood = new THREE.Color(0x2a1a10); // 焦げ茶
scene.background = darkWood;
scene.fog = new THREE.Fog(darkWood, 30, 90);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
// プレイヤーの後ろ上空から見下ろすTPV視点
camera.position.set(0, 8, 20);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// --- Lights ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
// シャドウマップの範囲調整
dirLight.shadow.camera.left = -20;
dirLight.shadow.camera.right = 20;
dirLight.shadow.camera.top = 20;
dirLight.shadow.camera.bottom = -80;
scene.add(dirLight);

// 和風のポイントライト（提灯のような暖色）
const pointLight = new THREE.PointLight(0xffa500, 5, 30); // オレンジの暖色系
pointLight.position.set(0, 5, 10);
scene.add(pointLight);

// --- Environment (Floor & Lanes) ---
const floorGroup = new THREE.Group();
scene.add(floorGroup);

// 床（寿司を乗せる下駄のような白木風）
const floorGeo = new THREE.PlaneGeometry(LANE_WIDTH * LANE_COUNT, 200);
const floorMat = new THREE.MeshStandardMaterial({
    color: 0xdecba4, // 白木の色
    roughness: 0.8,  // 木の質感を出すためラフネスを上げる
    metalness: 0.1
});
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.position.z = -40; // 奥に伸ばす
floorMesh.receiveShadow = true;
floorGroup.add(floorMesh);

// 区切り線（濃い色で溝を表現）
const lineMat = new THREE.MeshBasicMaterial({ color: 0x5c3a21 });
for (let i = 1; i < LANE_COUNT; i++) {
    const lineGeo = new THREE.PlaneGeometry(0.2, 200);
    const lineNode = new THREE.Mesh(lineGeo, lineMat);
    lineNode.rotation.x = -Math.PI / 2;
    // レーンの境界のX座標を計算
    const startX = -(LANE_WIDTH * LANE_COUNT) / 2;
    lineNode.position.x = startX + (i * LANE_WIDTH);
    lineNode.position.y = 0.01; // 床よりわずかに上
    lineNode.position.z = -40;
    floorGroup.add(lineNode);
}

// 疾走感を出すための動く床マーカー
for (let i = 0; i < 20; i++) {
    const mGeo = new THREE.BoxGeometry(0.5, 0.1, 4);
    // マーカーも木目色
    const mMat = new THREE.MeshBasicMaterial({ color: 0x8e6530 });
    const mark = new THREE.Mesh(mGeo, mMat);
    mark.position.x = -(LANE_WIDTH * LANE_COUNT) / 2 - 1; // 左端の外側
    mark.position.z = START_Z + (i * 5);
    mark.position.y = 0.05;
    scene.add(mark);
    floorLines.push(mark);

    // 右端の外側にも追加
    const markR = mark.clone();
    markR.position.x = (LANE_WIDTH * LANE_COUNT) / 2 + 1;
    scene.add(markR);
    floorLines.push(markR);
}

// レーンのインデックスからX座標を算出するヘルパー
function getXFromLane(laneIndex) {
    const startX = -(LANE_WIDTH * LANE_COUNT) / 2;
    return startX + (laneIndex * LANE_WIDTH) + (LANE_WIDTH / 2);
}

// --- Player Object ---
const playerGroup = new THREE.Group();
scene.add(playerGroup);

// プレイヤーを本物っぽいお箸で表現
const hashiGeo = new THREE.CylinderGeometry(0.15, 0.25, 4, 16); // 先が少し細い形
const hashiMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9, metalness: 0 }); // 濃い茶色（木製）

const hashi1 = new THREE.Mesh(hashiGeo, hashiMat);
hashi1.rotation.x = Math.PI / 2; // 寝かせる
hashi1.position.x = -0.5;
hashi1.castShadow = true;
playerGroup.add(hashi1);

const hashi2 = new THREE.Mesh(hashiGeo, hashiMat);
hashi2.rotation.x = Math.PI / 2;
hashi2.position.x = 0.5;
hashi2.castShadow = true;
playerGroup.add(hashi2);

// 当たり判定用のBox (プレイヤーサイズ)
const playerBox = new THREE.Box3();

// プレイヤーの初期位置
playerGroup.position.z = PLAYER_Z;
playerGroup.position.y = 1; // 浮かせる
playerGroup.position.x = getXFromLane(currentLane);

// --- Sushi Factory (Obstacles) ---
// 寿司ネタのカラー
const SUSHI_TYPES = [
    { name: 'maguro', color: 0xff3333 }, // マグロ（赤）
    { name: 'tamago', color: 0xffdd33 }, // たまご（黄）
    { name: 'salmon', color: 0xff8833 }, // サーモン（オレンジ）
    { name: 'tako', color: 0xffccdd }  // タコ（ピンク）
];

function createSushiMesh() {
    const type = SUSHI_TYPES[Math.floor(Math.random() * SUSHI_TYPES.length)];

    const sushiGroup = new THREE.Group();

    // シャリ（白くて四角い）
    const shariGeo = new THREE.BoxGeometry(1.8, 1, 2.5);
    const shariMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const shari = new THREE.Mesh(shariGeo, shariMat);
    shari.position.y = 0.5;
    shari.castShadow = true;
    sushiGroup.add(shari);

    // ネタ（シャリの上に乗る）
    const netaGeo = new THREE.BoxGeometry(2, 0.5, 3);
    const netaMat = new THREE.MeshStandardMaterial({ color: type.color, roughness: 0.5 });
    const neta = new THREE.Mesh(netaGeo, netaMat);
    neta.position.y = 1.25;
    neta.castShadow = true;
    sushiGroup.add(neta);

    // 全体を少しスケーリング
    sushiGroup.scale.set(1.2, 1.2, 1.2);

    return { mesh: sushiGroup, box: new THREE.Box3() };
}

// 醤油の表示用プレーン（床に広がる醤油）を作る関数
function createShoyuMesh() {
    const geo = new THREE.PlaneGeometry(LANE_WIDTH - 0.2, 100);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x3a1a00, // 濃い醤油色
        transparent: true,
        opacity: 0.8
    });
    const shoyu = new THREE.Mesh(geo, mat);
    shoyu.rotation.x = -Math.PI / 2;
    shoyu.position.y = 0.05; // 床よりわずかに上
    return shoyu;
}

// 醤油差し（ディスペンサー）のモデル
function createDispenserMesh() {
    const group = new THREE.Group();

    // 本体（ガラス・黒い醤油入り）
    const bodyGeo = new THREE.CylinderGeometry(0.8, 0.9, 1.8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x221100, roughness: 0.2, transparent: true, opacity: 0.9 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9;
    body.castShadow = true;
    group.add(body);

    // 赤いフタ
    const capGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.5, 16);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.5 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 2.05;
    group.add(cap);

    // 注ぎ口 (左側に伸ばす)
    const spoutGeo = new THREE.CylinderGeometry(0.05, 0.15, 0.8, 8);
    const spout = new THREE.Mesh(spoutGeo, capMat);
    spout.position.set(-0.9, 2.1, 0); // 左側に配置
    spout.rotation.z = Math.PI / 3; // 左斜め上を向くよう傾斜
    group.add(spout);

    return group;
}

function spawnSushi() {
    // レベルに応じた確率で2レーン同時に出現
    const isDoubleSpawn = Math.random() < doubleSpawnChance;
    
    // レベルに応じた確率で醤油が出現（どこか1レーン）
    if (Math.random() < shoyuChance) {
        spawnShoyu();
    }

    let lane1 = Math.floor(Math.random() * LANE_COUNT);
    createAndAddSushi(lane1);

    if (isDoubleSpawn) {
        let lane2 = Math.floor(Math.random() * LANE_COUNT);
        // 同じレーンにならないように調整
        while (lane2 === lane1) {
            lane2 = Math.floor(Math.random() * LANE_COUNT);
        }
        createAndAddSushi(lane2);
    }
}

// 個別の寿司を生成してシーンに追加するヘルパー
function createAndAddSushi(lane) {
    const sushiObj = createSushiMesh();

    sushiObj.mesh.position.x = getXFromLane(lane);
    sushiObj.mesh.position.y = 0; // 床面
    sushiObj.mesh.position.z = START_Z;

    scene.add(sushiObj.mesh);
    sushis.push(sushiObj);
}

// 醤油を生成（レーン加速）
function spawnShoyu() {
    const targetLane = Math.floor(Math.random() * LANE_COUNT);

    // すでに同じレーンに醤油がある場合は上書き（タイマーリセット）
    const existing = shoyuEffects.find(eff => eff.lane === targetLane);
    if (existing) {
        existing.timer = 0;
        existing.mesh.scale.set(0.01, 0.01, 1); // ふたたびアニメーション開始
        existing.dispenser.position.y = 8;
        return;
    }

    const shoyuMesh = createShoyuMesh();
    shoyuMesh.position.x = getXFromLane(targetLane);
    shoyuMesh.position.z = -10;
    shoyuMesh.scale.set(0.01, 0.01, 1); // 初期状態では見えないように縮小
    scene.add(shoyuMesh);

    // 醤油差しの生成
    const dispenser = createDispenserMesh();
    dispenser.position.z = -10;
    dispenser.position.x = getXFromLane(targetLane) + 1.5; // レーンの少し右から出てきて左に注ぐ
    dispenser.position.y = 8; // 上空から
    scene.add(dispenser);

    shoyuEffects.push({
        lane: targetLane,
        timer: 0,
        mesh: shoyuMesh,
        dispenser: dispenser
    });
}


// --- Logic & Loop ---
const clock = new THREE.Clock();

// UI Elements
const scoreDisplay = document.getElementById('scoreDisplay');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreDisplay = document.getElementById('finalScoreDisplay');
const btnRestart = document.getElementById('btnRestart');
const btnHome = document.getElementById('btnHome');
const levelButtons = document.querySelectorAll('.btn-level');

function initGame(level = 2) {
    currentLevel = parseInt(level);
    
    // リセット
    score = 0;
    spawnTimer = 0;
    currentLane = 1;
    updatePlayerXInstant();

    // レベル別のパラメータ設定
    switch(currentLevel) {
        case 1: // 初級
            currentSpeed = 30;
            spawnInterval = 1.0;
            doubleSpawnChance = 0.02;
            shoyuChance = 0.005;
            break;
        case 2: // 中級
            currentSpeed = 50;
            spawnInterval = 0.6;
            doubleSpawnChance = 0.1;
            shoyuChance = 0.02;
            break;
        case 3: // 上級
            currentSpeed = 75;
            spawnInterval = 0.45;
            doubleSpawnChance = 0.25;
            shoyuChance = 0.06;
            break;
        case 4: // 神級
            currentSpeed = 110;
            spawnInterval = 0.25;
            doubleSpawnChance = 0.45;
            shoyuChance = 0.12;
            break;
    }
    
    speedMultiplier = 1.0;

    // 既存の寿司・醤油を削除
    sushis.forEach(s => scene.remove(s.mesh));
    sushis = [];
    shoyuEffects.forEach(eff => {
        scene.remove(eff.mesh);
        scene.remove(eff.dispenser);
    });
    shoyuEffects = [];

    scoreDisplay.textContent = score;

    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    document.getElementById('btnHome').classList.remove('hidden');
    gameActive = true;
}

function stopGame() {
    gameActive = false;
    const title = document.getElementById('statusTitle');
    const msg = document.getElementById('statusMsg');
    title.textContent = 'ゲームオーバー';
    title.style.color = '#8b0000';
    msg.textContent = 'お寿司に激突しました💥';
    finalScoreDisplay.textContent = Math.floor(score);
    gameOverScreen.classList.remove('hidden');
    document.getElementById('btnHome').classList.add('hidden');

    // 2.5秒後に自動的にホームへ
    setTimeout(() => {
        goHome();
    }, 2500);
}

function gameClear() {
    gameActive = false;
    
    // 次のレベルを解放
    if (currentLevel === unlockedLevel && unlockedLevel < 4) {
        unlockedLevel++;
        localStorage.setItem('sushi_unlocked_level', unlockedLevel);
    }

    const title = document.getElementById('statusTitle');
    const msg = document.getElementById('statusMsg');
    title.textContent = 'CLEAR!!';
    title.style.color = '#d4a373'; 
    msg.textContent = '1000スコア到達！お見事です！🍣';
    finalScoreDisplay.textContent = '1000';
    gameOverScreen.classList.remove('hidden');
    document.getElementById('btnHome').classList.add('hidden');

    // 祝賀演出
    const overlay = document.getElementById('celebration-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('cracker-left').classList.add('active');
    document.getElementById('cracker-right').classList.add('active');
    
    launchConfetti();

    // 3.5秒後に自動的にホームへ
    setTimeout(() => {
        overlay.classList.add('hidden');
        document.getElementById('cracker-left').classList.remove('active');
        document.getElementById('cracker-right').classList.remove('active');
        goHome();
    }, 3500);
}

function launchConfetti() {
    const container = document.getElementById('confetti-container');
    container.innerHTML = '';
    const colors = ['#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#ffffff', '#eccc68'];
    
    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        const color = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.backgroundColor = color;
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.top = '-20px';
        confetti.style.width = (Math.random() * 8 + 5) + 'px';
        confetti.style.height = confetti.style.width;
        
        // ランダムなアニメーション
        const duration = Math.random() * 2 + 1.5;
        const delay = Math.random() * 0.5;
        confetti.style.animation = `confetti-fall ${duration}s ${delay}s linear forwards`;
        
        container.appendChild(confetti);
    }
}

function goHome() {
    gameActive = false;
    // 既存の寿司・醤油を削除
    sushis.forEach(s => scene.remove(s.mesh));
    sushis = [];
    shoyuEffects.forEach(eff => {
        scene.remove(eff.mesh);
        scene.remove(eff.dispenser);
    });
    shoyuEffects = [];
    
    updateLevelButtons();
    startScreen.classList.remove('hidden');
    gameOverScreen.classList.add('hidden');
    document.getElementById('btnHome').classList.add('hidden');
}

function updateLevelButtons() {
    levelButtons.forEach(btn => {
        const lv = parseInt(btn.getAttribute('data-level'));
        if (lv <= unlockedLevel) {
            btn.classList.remove('locked');
            btn.disabled = false;
        } else {
            btn.classList.add('locked');
            btn.disabled = true;
        }
    });
}

// ユーザー入力
window.addEventListener('keydown', (e) => {
    if (!gameActive) return;

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (currentLane > 0) currentLane--;
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (currentLane < LANE_COUNT - 1) currentLane++;
    }
});

btnRestart.addEventListener('click', () => initGame(currentLevel));
btnHome.addEventListener('click', goHome);

// レベル選択ボタンのイベントリスナー
levelButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const lv = btn.getAttribute('data-level');
        initGame(lv);
    });
});

// 初期表示時のボタン状態を更新
updateLevelButtons();

// リサイズ対応
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// プレイヤー座標の即時反映(リセット時)
function updatePlayerXInstant() {
    playerGroup.position.x = getXFromLane(currentLane);
}

function update(dt) {
    if (!gameActive) return;

    // 難易度上昇
    const level = Math.floor(score / 200);
    speedMultiplier = 1.0 + (level * 0.4); // 200点ごとに40%加速
    const actualSpeed = currentSpeed * speedMultiplier;

    // スコア加算 (生き残っているだけで増える、一定のペースを保つため基本速度で計算)
    score += currentSpeed * dt * 0.5;

    // ゲームクリア判定
    if (score >= 1000) {
        score = 1000;
        scoreDisplay.textContent = '1000';
        gameClear();
        return;
    }

    scoreDisplay.textContent = Math.floor(score);

    // プレイヤーの移動（補間して滑らかに動かす Lerp）
    const targetX = getXFromLane(currentLane);
    playerGroup.position.x += (targetX - playerGroup.position.x) * 15 * dt;

    // プレイヤーの当たり判定Boxを更新
    playerBox.setFromObject(playerGroup);
    // 判定を少し小さくする（遊びをもたせる）
    playerBox.expandByScalar(-0.5);

    // 寿司の生成
    spawnTimer += dt;
    const currentSpawnInterval = Math.max(0.15, spawnInterval / speedMultiplier);
    if (spawnTimer > currentSpawnInterval) {
        spawnSushi();
        spawnTimer = 0;
    }

    // 醤油エフェクトの更新
    for (let i = shoyuEffects.length - 1; i >= 0; i--) {
        const eff = shoyuEffects[i];
        eff.timer += dt;
        const t = eff.timer;

        // 醤油差しの落下・傾き・去るアニメーション
        if (t < 0.3) {
            // 落下してくる
            const p = t / 0.3;
            eff.dispenser.position.y = 8 - (6 * p); // 8 -> 2
        } else if (t < 0.8) {
            // 左に傾けて注ぐ & 醤油が広がる
            const p = (t - 0.3) / 0.5;
            eff.dispenser.position.y = 2;
            eff.dispenser.rotation.z = (Math.PI / 4) * p; // 最大45度傾ける

            // 床の醤油を広げる
            const s = Math.max(0.01, p);
            eff.mesh.scale.set(s, s, 1);
        } else if (t < 1.3) {
            // 元の角度に戻りながら上昇して消える
            const p = (t - 0.8) / 0.5;
            eff.dispenser.rotation.z = (Math.PI / 4) * (1 - p);
            eff.dispenser.position.y = 2 + (6 * p);
            eff.mesh.scale.set(1, 1, 1);
        } else {
            // 完全に見えなくする
            eff.dispenser.position.y = 20;
        }

        // 開始から4秒（注ぎ終わってから約3秒）で削除
        if (t > 4.0) {
            scene.remove(eff.mesh);
            scene.remove(eff.dispenser);
            shoyuEffects.splice(i, 1);
        }
    }

    // 寿司の移動と当たり判定
    for (let i = sushis.length - 1; i >= 0; i--) {
        const s = sushis[i];

        // この寿司が醤油レーンにいるか判定 (注ぎ終わった0.5秒後から効果発揮)
        const onShoyu = shoyuEffects.some(eff => eff.lane === s.lane && eff.timer > 0.5);
        // 醤油レーンの場合は移動速度が＋される（例えば2.5倍速）
        const sushiSpeed = actualSpeed * (onShoyu ? 2.5 : 1.0);

        // 手前に迫ってくる
        s.mesh.position.z += sushiSpeed * dt;

        // 当たり判定Box更新
        s.box.setFromObject(s.mesh);
        s.box.expandByScalar(-0.2); // 寿司側の判定も微調整

        // 衝突チェック（Z軸が重なり、X軸も重なったらアウト）
        if (playerBox.intersectsBox(s.box)) {
            stopGame();

            // 衝突時のクラッシュエフェクト（赤くする）
            playerGroup.children.forEach(c => c.material.emissive.setHex(0xff0000));
            return; // ループを抜ける
        }

        // カメラの後ろに通り過ぎたら削除
        if (s.mesh.position.z > DESPAWN_Z) {
            scene.remove(s.mesh);
            sushis.splice(i, 1);
        } else {
            // 現在のレーン情報を保存しておく（醤油判定のため）
            // 座標からレーンindexを逆算
            const startX = -(LANE_WIDTH * LANE_COUNT) / 2;
            s.lane = Math.floor((s.mesh.position.x - startX) / LANE_WIDTH);
        }
    }

    // 床の流れるマーカーの更新 (疾走感)
    floorLines.forEach(mark => {
        mark.position.z += actualSpeed * dt;
        if (mark.position.z > DESPAWN_Z) {
            mark.position.z = START_Z;
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);

    update(dt);

    // アイドル時のプレイヤーのふわふわアニメーション
    if (!gameActive) {
        playerGroup.position.y = 1 + Math.sin(Date.now() * 0.005) * 0.2;
    } else {
        // 通常時は固定高
        playerGroup.position.y += (1 - playerGroup.position.y) * 10 * dt;
        // 前後への傾き（スピード感）
        playerGroup.rotation.x = -0.1 * speedMultiplier;
    }

    renderer.render(scene, camera);
}

// 開始
animate();
