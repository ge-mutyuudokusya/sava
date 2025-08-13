// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDKjyxK2RixQKkpNp3kZkijDPGi39aNceE",
  authDomain: "daily-feed-414b6.firebaseapp.com",
  databaseURL: "https://daily-feed-414b6-default-rtdb.firebaseio.com",
  projectId: "daily-feed-414b6",
  storageBucket: "daily-feed-414b6.firebasestorage.app",
  messagingSenderId: "360432327059",
  appId: "1:360432327059:web:3536deb1aa86055a4d3066",
  measurementId: "G-77GZVSMMP2"
};


firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let userId = null;
let roomId = null;

// ===== 追加: キャラ・ステータス・マッチング =====
let mode = null; // 'random' | 'private'
let passcode = null;
let charKey = 'warrior';
let stats = { hp: 10, mp: 5, wp: 5 };
let opponentLeftWinnerDeclared = false;
let moveTimer = null;
const MOVE_TIMEOUT_MS = 10000; // 10秒

const CHAR_PRESETS = {
  warrior: { img: "images/1.jpg", hp: 12, mp: 4, wp: 4 },
  mage:    { img: "images/character.png", hp: 8,  mp: 8, wp: 4 }
};

function pickCharacter() {
  const sel = document.querySelector('input[name="ch"]:checked');
  charKey = sel ? sel.value : 'warrior';
  stats = { ...CHAR_PRESETS[charKey] };
  // UIに反映
  document.getElementById('my-ch-img').src = CHAR_PRESETS[charKey].img;
  updateStatBars();
}

function updateStatBars() {
  const {hp, mp, wp} = stats;
  const maxhp = 12, maxmp = 10, maxwp = 10;
  document.getElementById('hp-bar').max = maxhp;
  document.getElementById('mp-bar').max = maxmp;
  document.getElementById('wp-bar').max = maxwp;
  document.getElementById('hp-bar').value = Math.max(0, hp);
  document.getElementById('mp-bar').value = Math.max(0, mp);
  document.getElementById('wp-bar').value = Math.max(0, wp);
  document.getElementById('hp-val').innerText = `${hp}/${maxhp}`;
  document.getElementById('mp-val').innerText = `${mp}/${maxmp}`;
  document.getElementById('wp-val').innerText = `${wp}/${maxwp}`;
}

function startMatch(selectedMode, code) {
  mode = selectedMode;
  passcode = (mode === 'private') ? (code || Math.random().toString(36).slice(2,8)) : null;
  // キャラ確定
  pickCharacter();
  // ロビーを隠してバトルUI表示
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('battle-ui').style.display = 'block';
  // 既存の仕組みを分岐
  if (mode === 'private') {
    createOrJoinPrivate(passcode);
    document.getElementById('status').innerText = `プライベートマッチ合言葉: ${passcode}`;
  } else {
    findOrCreateRoom(); // ランダムマッチは既存処理
  }
}

// 既存 findOrCreateRoom はランダムマッチ。部屋作成時に初期ステータスを書き込むよう拡張

let playerRole = null; // "player1" or "player2"
let isHandSet = false;

const handImages = {
  rock: "images/rock.png",
  paper: "images/paper.png",
  scissors: "images/scissors.png"
};

firebase.auth().signInAnonymously().then(() => {
  userId = firebase.auth().currentUser.uid;
  // マッチングはボタンから開始
});

function findOrCreateRoom() {
  db.ref("rooms").once("value", snapshot => {
    let joined = false;
    snapshot.forEach(roomSnap => {
      const room = roomSnap.val();
      if (!room.player2) {
        roomId = roomSnap.key;
        playerRole = "player2";
        db.ref(`rooms/${roomId}/player2`).set(userId);
        joined = true;
        setupRoom();
      }
    });
    if (!joined) {
      roomId = db.ref("rooms").push().key;
      playerRole = "player1";
      db.ref(`rooms/${roomId}`).set({ player1: userId, status: "waiting", mode: "random", stats: { player1: stats, player2: null } });
      waitForPlayer2();
    }
  });
}

function waitForPlayer2() {
  document.getElementById("status").innerText = "対戦相手を待っています...";
  db.ref(`rooms/${roomId}/player2`).on("value", snap => {
    if (snap.exists()) {
      setupRoom();
    }
  });
}

function setupRoom() {
  document.getElementById("status").innerText = "対戦開始！手を選んでください";
  enableButtons(true);
  // 初期ステータスをDBへ（player2が入ったタイミングで）
  if (playerRole === "player2") {
    db.ref(`rooms/${roomId}/stats/player2`).set(stats);
  }
  watchHands();
}

function choose(hand) {
  if (isHandSet) return;
  isHandSet = true;
  enableButtons(false);
  document.getElementById("status").innerText = "相手の手を待っています...";

  // 追加: 手のペナルティ適用
  if (hand === "rock") stats.hp -= 1;
  else if (hand === "scissors") stats.mp -= 1;
  else if (hand === "paper") stats.wp -= 1;
  updateStatBars();

  // ベースパス判定
  const basePath = (mode === 'private') ? `rooms_private/${roomId}` : `rooms/${roomId}`;

  // ステータス同期（部屋に保存）
  if (roomId) {
    const roleKey = playerRole;
    db.ref(`${basePath}/stats/${roleKey}`).set(stats);
  }

  db.ref(`${basePath}/hands/${playerRole}`).set({
    hand: hand,
    timestamp: Date.now()
  });

  showHand("my-hand", hand);
}

function enableButtons(enable) {
  document.querySelectorAll(".buttons button").forEach(btn => btn.disabled = !enable);
}

function showHand(id, hand) {
  const img = document.getElementById(id);
  img.src = handImages[hand];
}

function watchHands() {
  // presence（退出検知）
  setupPresence(`rooms/${roomId}`);

  db.ref(`rooms/${roomId}/hands`).on("value", snapshot => {
    const hands = snapshot.val() || {};
    const myHand = hands[playerRole]?.hand;
    const opponentRole = (playerRole === "player1") ? "player2" : "player1";
    const opponentHand = hands[opponentRole]?.hand;

    if (myHand) showHand("my-hand", myHand);
    if (opponentHand) showHand("opponent-hand", opponentHand);

    // タイムアウト管理
    manageMoveTimeout(hands);

    if (myHand && opponentHand) {
      clearMoveTimeout();
      const result = judge(myHand, opponentHand);
      applyResultAndShow(result, /*isPrivate*/false);
    }
  });
}/hands`).on("value", snap => {
    const hands = snap.val();
    if (!hands) return;

    const myHand = hands[playerRole]?.hand;
    const opponentRole = playerRole === "player1" ? "player2" : "player1";
    const opponentHand = hands[opponentRole]?.hand;

    if (myHand && opponentHand) {
      showHand("opponent-hand", opponentHand);

      const result = judge(myHand, opponentHand);
      showResult(result);

      setTimeout(() => {
        db.ref(`rooms/${roomId}/hands`).remove();
        resetView();
      }, 3000);
    }
  });
}

function judge(me, them) {
  if (me === them) return "draw";
  if ((me === "rock" && them === "scissors") ||
      (me === "scissors" && them === "paper") ||
      (me === "paper" && them === "rock")) {
    return "win";
  }
  return "lose";
}

function showResult(result) {
  const resultText = document.getElementById("result-text");
  const resultImg = document.getElementById("result-img");

  switch (result) {
    case "win":
      resultText.innerText = "あなたの勝ち！";
      resultImg.src = "images/瞬きAPNG.png";
      break;
    case "lose":
      resultText.innerText = "あなたの負け...";
      resultImg.src = "images/1.jpg";
      break;
    case "draw":
      resultText.innerText = "引き分け！";
      resultImg.src = "images/draw.gif";
      break;
  }

  document.getElementById("status").innerText = "次の勝負をどうぞ！";
}

function resetView() {
  isHandSet = false;
  document.getElementById("my-hand").src = "";
  document.getElementById("opponent-hand").src = "";
  document.getElementById("result-text").innerText = "";
  document.getElementById("result-img").src = "";
  document.getElementById("status").innerText = "手を選んでください";
  enableButtons(true);
}


function createOrJoinPrivate(code) {
  // パス: rooms_private/{code}
  db.ref(`rooms_private/${code}`).once("value", snap => {
    const val = snap.val();
    if (!val) {
      roomId = code;
      playerRole = "player1";
      db.ref(`rooms_private/${code}`).set({
        player1: userId,
        status: "waiting",
        mode: "private",
        stats: { player1: stats, player2: null }
      });
      // 相手待ち
      waitForPlayer2Private(code);
    } else if (val && !val.player2) {
      roomId = code;
      playerRole = "player2";
      db.ref(`rooms_private/${code}/player2`).set(userId);
      db.ref(`rooms_private/${code}/stats/player2`).set(stats);
      setupRoomPrivate(code);
    } else {
      document.getElementById("status").innerText = "その合言葉の部屋は満員です";
    }
  });
}

function waitForPlayer2Private(code) {
  document.getElementById("status").innerText = "相手を待っています...";
  db.ref(`rooms_private/${code}/player2`).on("value", s => {
    if (s.exists()) {
      setupRoomPrivate(code);
    }
  });
}

function setupRoomPrivate(code) {
  document.getElementById("status").innerText = "対戦開始！手を選んでください";
  enableButtons(true);
  // presence: 退出検知
  setupPresence(`rooms_private/${code}`);
  // 手監視
  watchHandsPrivate(code);
}

function watchHandsPrivate(code) {
  db.ref(`rooms_private/${code}/hands`).on("value", snapshot => {
    const hands = snapshot.val() || {};
    const myHand = hands[playerRole]?.hand;
    const opponentRole = (playerRole === "player1") ? "player2" : "player1";
    const opponentHand = hands[opponentRole]?.hand;

    if (myHand) showHand("my-hand", myHand);
    if (opponentHand) showHand("opponent-hand", opponentHand);

    // タイムアウト判定開始（自分が出したら相手が10秒出さない場合勝ち）
    manageMoveTimeout(hands);

    if (myHand && opponentHand) {
      clearMoveTimeout();
      const result = judge(myHand, opponentHand);
      applyResultAndShow(result, /*isPrivate*/true, code);
    }
  });
}

// 共通：presence（切断検知）
function setupPresence(roomPathBase) {
  const mePath = `${roomPathBase}/presence/${playerRole}`;
  db.ref(mePath).set(true);
  db.ref(mePath).onDisconnect().remove();

  const opponentRole = (playerRole === "player1") ? "player2" : "player1";
  db.ref(`${roomPathBase}/presence/${opponentRole}`).on("value", s => {
    const present = s.exists();
    if (!present && !opponentLeftWinnerDeclared) {
      opponentLeftWinnerDeclared = true;
      showResult("win");
      document.getElementById("status").innerText = "相手が退出したため勝利";
      // 部屋クリーンアップは適宜
    }
  });
}

// 共通：手選択のタイムアウト管理
function manageMoveTimeout(hands) {
  const my = hands[playerRole]?.hand;
  const opponentRole = (playerRole === "player1") ? "player2" : "player1";
  const them = hands[opponentRole]?.hand;

  if (my && !them && !moveTimer) {
    let remain = MOVE_TIMEOUT_MS / 1000;
    document.getElementById("timer-val").innerText = remain;
    moveTimer = setInterval(() => {
      remain--;
      document.getElementById("timer-val").innerText = remain;
      if (remain <= 0) {
        clearMoveTimeout();
        // 相手が未入力→勝ち
        showResult("win");
        document.getElementById("status").innerText = "相手が10秒以内に出さなかったため勝利";
      }
    }, 1000);
  } else if (!my || them) {
    clearMoveTimeout();
  }
}
function clearMoveTimeout() {
  if (moveTimer) {
    clearInterval(moveTimer);
    moveTimer = null;
    document.getElementById("timer-val").innerText = "--";
  }
}

// 勝敗の適用（ステータス変動 & リセット）
function applyResultAndShow(result, isPrivate, code) {
  // 勝敗に応じてステータス変動
  if (result === "win") stats.mp += 1;
  else if (result === "lose") { stats.wp += 1; stats.hp -= 1; }
  // HPチェック
  if (stats.hp <= 0) {
    showResult("lose");
    document.getElementById("status").innerText = "HPが0になりました。敗北…";
  } else {
    showResult(result);
    document.getElementById("status").innerText = "次の勝負をどうぞ！";
  }
  updateStatBars();

  // ラウンドリセット
  const basePath = isPrivate ? `rooms_private/${code}` : `rooms/${roomId}`;
  setTimeout(() => {
    db.ref(`${basePath}/hands`).remove();
    resetView();
  }, 3000);
}
