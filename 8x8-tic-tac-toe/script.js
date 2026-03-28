let BOARD_SIZE = 8;
let WINNING_COUNT = 8;

const PLAYER_O = 'O';
const PLAYER_X = 'X';

let currentPlayer = PLAYER_O;
let gameState = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
let gameActive = false; // スタート前はfalse
let gameMode = 'PvP'; // 'PvP' or 'PvC'
let isAITurn = false;

// DOM Elements
const startScreen = document.getElementById('startScreen');
const gameScreen = document.getElementById('gameScreen');
const btnPvc = document.getElementById('btnPvc');
const btnPvp = document.getElementById('btnPvp');
const sizeSelector = document.getElementById('sizeSelector');
const currentSizeDisplay = document.getElementById('currentSizeDisplay');
const headerSizeText = document.getElementById('headerSizeText');
const headerSizeText2 = document.getElementById('headerSizeText2');
const headerWinText = document.getElementById('headerWinText');

const boardElement = document.getElementById('board');
const currentPlayerIcon = document.getElementById('currentPlayerIcon');
const turnText = document.getElementById('turnText');
const resetButton = document.getElementById('resetButton');
const resultModal = document.getElementById('resultModal');
const resultTitle = document.getElementById('resultTitle');
const playAgainButton = document.getElementById('playAgainButton');
const modalContent = document.querySelector('.modal-content');
const homeButton = document.getElementById('homeButton');

// イベントリスナー
sizeSelector.addEventListener('input', updateSizeDisplay);
homeButton.addEventListener('click', backToMenu);
btnPvc.addEventListener('click', () => startGame('PvC'));
btnPvp.addEventListener('click', () => startGame('PvP'));
resetButton.addEventListener('click', backToMenu);
playAgainButton.addEventListener('click', () => initGame(gameMode));

// スライダー操作時に表示を更新
function updateSizeDisplay() {
    const val = sizeSelector.value;
    currentSizeDisplay.textContent = `${val} x ${val} (${val} CONNECT)`;
    headerSizeText.textContent = val;
    headerSizeText2.textContent = val;
    headerWinText.textContent = val;
}

// モード選択からゲーム開始
function startGame(mode) {
    BOARD_SIZE = parseInt(sizeSelector.value);
    WINNING_COUNT = BOARD_SIZE;
    document.documentElement.style.setProperty('--board-size', BOARD_SIZE);

    startScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    initGame(mode);
}

// メニューへ戻る（リセット）
function backToMenu() {
    gameActive = false;
    startScreen.classList.remove('hidden');
    gameScreen.classList.add('hidden');
    closeModal();
}

// ゲーム初期化
function initGame(mode) {
    gameMode = mode;
    gameState = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    currentPlayer = PLAYER_O;
    gameActive = true;
    isAITurn = false;
    updateTurnIndicator();
    createBoard();
    closeModal();
}

function createBoard() {
    boardElement.innerHTML = '';
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.row = row;
            cell.dataset.col = col;
            cell.addEventListener('click', handleCellClick);
            boardElement.appendChild(cell);
        }
    }
}

function handleCellClick(e) {
    if (!gameActive || isAITurn) return;

    const cell = e.target;
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);

    if (gameState[row][col]) return;

    // プレイヤーのターン実行
    executeMove(row, col, currentPlayer);

    // AI対戦モードで次がAIのターンの場合
    if (gameActive && gameMode === 'PvC' && currentPlayer === PLAYER_X) {
        isAITurn = true;
        setTimeout(playAITurn, 500); // 0.5秒の思考時間
    }
}

// 石を置く処理と勝敗判定
function executeMove(row, col, player) {
    gameState[row][col] = player;

    // セルのUI更新
    const index = row * BOARD_SIZE + col;
    const cell = boardElement.children[index];
    cell.classList.add('marked');

    const span = document.createElement('span');
    if (player === PLAYER_O) {
        span.textContent = 'O';
        span.classList.add('mark-o');
    } else {
        span.textContent = 'X';
        span.classList.add('mark-x');
    }
    cell.appendChild(span);

    // 勝利判定
    const winningCells = checkWin(row, col, player);
    if (winningCells) {
        handleWin(winningCells, player);
        return;
    }

    // 引き分け判定
    if (checkDraw()) {
        handleDraw();
        return;
    }

    // ターン交代
    currentPlayer = player === PLAYER_O ? PLAYER_X : PLAYER_O;
    updateTurnIndicator();
}

// AIのターンロジック（強化版：評価関数ベース）
function playAITurn() {
    if (!gameActive) return;

    const move = getBestMoveEval(PLAYER_X);

    if (move) {
        executeMove(move.row, move.col, PLAYER_X);
    }

    isAITurn = false;
}

// 盤面上のすべての空きマスを評価し、最もスコアが高い手を選ぶ
function getBestMoveEval(aiPlayer) {
    const humanPlayer = aiPlayer === PLAYER_X ? PLAYER_O : PLAYER_X;
    let bestScore = -Infinity;
    let bestMoves = [];

    // 周囲に石が一つもない場合は中央付近のお決まりの場所に打つ（探索省略）
    let stoneCount = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (gameState[r][c]) stoneCount++;
        }
    }
    if (stoneCount === 0 || (stoneCount === 1 && !gameState[3][3])) {
        return { row: 3, col: 3 };
    } else if (stoneCount === 1) {
        return { row: 4, col: 4 };
    }

    // 近接マス（石の周囲2マス以内）のみを探索対象にする（計算量削減と自然な手のため）
    const candidateCells = getCandidateCells();
    if (candidateCells.length === 0) return null;

    for (const cell of candidateCells) {
        const { r, c } = cell;

        // 自分がここに打った場合の攻撃スコア
        const attackScore = evaluateCell(r, c, aiPlayer);
        // 相手がここに打った場合の防衛スコア（相手の妨害）
        const defenseScore = evaluateCell(r, c, humanPlayer);

        // 攻撃と防御のスコアを合成。五目並べの特徴として、防がないと負ける場面が多いため defenseScore を重視（1.2倍）
        const totalScore = attackScore + (defenseScore * 1.2) + Math.random() * 0.1; // 同点時のランダム性

        if (totalScore > bestScore) {
            bestScore = totalScore;
            bestMoves = [{ row: r, col: c }];
        } else if (Math.abs(totalScore - bestScore) < 0.001) {
            bestMoves.push({ row: r, col: c });
        }
    }

    // 同点の中でランダムに選ぶ
    if (bestMoves.length > 0) {
        const randomIndex = Math.floor(Math.random() * bestMoves.length);
        return bestMoves[randomIndex];
    }

    return null;
}

// 周囲に石が存在する空きマスのみを抽出する（探索空間の限定）
function getCandidateCells() {
    const candidates = [];
    const checked = Array(BOARD_SIZE).fill(false).map(() => Array(BOARD_SIZE).fill(false));

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (gameState[r][c]) {
                // 石の周囲2マスを候補に追加
                for (let dr = -2; dr <= 2; dr++) {
                    for (let dc = -2; dc <= 2; dc++) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                            if (!gameState[nr][nc] && !checked[nr][nc]) {
                                candidates.push({ r: nr, c: nc });
                                checked[nr][nc] = true;
                            }
                        }
                    }
                }
            }
        }
    }
    return candidates;
}

// 特定のマスに特定のプレイヤーが石を置いた時の「並び」によるスコアを計算
function evaluateCell(row, col, player) {
    let totalScore = 0;
    const directions = [
        [0, 1],   // 横
        [1, 0],   // 縦
        [1, 1],   // 右下斜め
        [1, -1]   // 左下斜め
    ];

    for (const [dr, dc] of directions) {
        totalScore += evaluateDirection(row, col, dr, dc, player);
    }
    return totalScore;
}

// 1方向（直線とその逆方向）についての点数計算
function evaluateDirection(row, col, dr, dc, player) {
    let consecutive = 1; // 置いた石を1とする

    // プラス方向を調べる
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (gameState[r][c] === player) {
            consecutive++;
        } else if (gameState[r][c] !== null) {
            return 0; // 相手の石が1つでもあれば、その直線で8個並べることは不可能
        }
        r += dr;
        c += dc;
    }

    // マイナス方向を調べる
    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (gameState[r][c] === player) {
            consecutive++;
        } else if (gameState[r][c] !== null) {
            return 0; // 相手の石が1つでもあれば、その直線で8個並べることは不可能
        }
        r -= dr;
        c -= dc;
    }

    // 相手の石が一つもない直線上の場合、並んでいる数に応じてスコア付け
    if (consecutive >= WINNING_COUNT) return 10000000;
    if (consecutive === WINNING_COUNT - 1) return 1000000;
    if (consecutive === WINNING_COUNT - 2 && WINNING_COUNT > 2) return 100000;
    if (consecutive === WINNING_COUNT - 3 && WINNING_COUNT > 3) return 10000;
    if (consecutive === WINNING_COUNT - 4 && WINNING_COUNT > 4) return 1000;
    if (consecutive === WINNING_COUNT - 5 && WINNING_COUNT > 5) return 100;
    if (consecutive === 2) return 10;
    if (consecutive === 1) return 1;

    return 0;
}

// 周囲8マスに石があるか判定
function hasAdjacentStone(row, col) {
    for (let r = -1; r <= 1; r++) {
        for (let c = -1; c <= 1; c++) {
            if (r === 0 && c === 0) continue;
            const nr = row + r;
            const nc = col + c;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                if (gameState[nr][nc]) return true;
            }
        }
    }
    return false;
}

function checkWin(row, col, player) {
    const directions = [
        [[0, 1], [0, -1]],
        [[1, 0], [-1, 0]],
        [[1, 1], [-1, -1]],
        [[1, -1], [-1, 1]]
    ];

    for (const dir of directions) {
        let count = 1;
        let cells = [{ row, col }];

        for (const [dRow, dCol] of dir) {
            let r = row + dRow;
            let c = col + dCol;
            while (
                r >= 0 && r < BOARD_SIZE &&
                c >= 0 && c < BOARD_SIZE &&
                gameState[r][c] === player
            ) {
                count++;
                cells.push({ row: r, col: c });
                r += dRow;
                c += dCol;
            }
        }

        if (count >= WINNING_COUNT) {
            return cells;
        }
    }
    return null;
}

function checkDraw() {
    return gameState.every(row => row.every(cell => cell !== null));
}

function handleWin(winningCells, player) {
    gameActive = false;

    winningCells.forEach(({ row, col }) => {
        const index = row * BOARD_SIZE + col;
        boardElement.children[index].classList.add('winning-cell');
    });

    setTimeout(() => {
        if (player === PLAYER_O) {
            resultTitle.textContent = '1P (O) WINS!';
            modalContent.classList.add('winner-o');
            modalContent.classList.remove('winner-x');
        } else {
            if (gameMode === 'PvC') {
                resultTitle.textContent = 'COM (X) WINS!';
            } else {
                resultTitle.textContent = '2P (X) WINS!';
            }
            modalContent.classList.add('winner-x');
            modalContent.classList.remove('winner-o');
        }
        document.getElementById('resultMessage').textContent = 'GAME OVER';
        resultModal.classList.add('show');
    }, 500);
}

function handleDraw() {
    gameActive = false;
    setTimeout(() => {
        resultTitle.textContent = 'DRAW!';
        modalContent.classList.remove('winner-o', 'winner-x');
        document.getElementById('resultMessage').textContent = 'GAME OVER';
        resultModal.classList.add('show');
    }, 500);
}

function updateTurnIndicator() {
    const turnIndicator = document.getElementById('turnIndicator');
    if (currentPlayer === PLAYER_O) {
        currentPlayerIcon.textContent = 'O';
        turnText.textContent = '1P TURN';
        turnIndicator.style.borderColor = 'var(--color-p1)';
        currentPlayerIcon.style.color = 'var(--color-p1)';
        turnText.style.color = 'var(--color-p1)';
    } else {
        currentPlayerIcon.textContent = 'X';
        if (gameMode === 'PvC') {
            turnText.textContent = 'COM TURN';
        } else {
            turnText.textContent = '2P TURN';
        }
        turnIndicator.style.borderColor = 'var(--color-p2)';
        currentPlayerIcon.style.color = 'var(--color-p2)';
        turnText.style.color = 'var(--color-p2)';
    }
}

function closeModal() {
    resultModal.classList.remove('show');
}
