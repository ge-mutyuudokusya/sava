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
let playerRole = null; // "player1" or "player2"
let isHandSet = false;

const handImages = {
  rock: "images/rock.png",
  paper: "images/paper.png",
  scissors: "images/scissors.png"
};

firebase.auth().signInAnonymously().then(() => {
  userId = firebase.auth().currentUser.uid;
  findOrCreateRoom();
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
      db.ref(`rooms/${roomId}`).set({
        player1: userId,
        status: "waiting"
      });
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
  watchHands();
}

function choose(hand) {
  if (isHandSet) return;
  isHandSet = true;
  enableButtons(false);
  document.getElementById("status").innerText = "相手の手を待っています...";

  db.ref(`rooms/${roomId}/hands/${playerRole}`).set({
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
  db.ref(`rooms/${roomId}/hands`).on("value", snap => {
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
      resultImg.src = "images/lose.gif";
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
