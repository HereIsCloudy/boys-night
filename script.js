const firebaseConfig = {
    apiKey: "AIzaSyAiI-ODj4upCgZ7A2InbXlqH-AnocWn9BA",
    authDomain: "vraj-fighting-game.firebaseapp.com",
    projectId: "vraj-fighting-game",
    storageBucket: "vraj-fighting-game.firebasestorage.app",
    messagingSenderId: "776253692088",
    appId: "1:776253692088:web:5926c7fe8c3ee1f06dbc4d",
    databaseURL: "https://vraj-fighting-game-default-rtdb.asia-southeast1.firebasedatabase.app"
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
let peer = new Peer();
let myUsername = "Player_" + Math.floor(Math.random() * 1000);

peer.on('open', (id) => {
    database.ref('users/' + myUsername).set({ status: 'online', peerId: id });
    renderLeaderboard();
});

function renderLeaderboard() {
    database.ref('users').on('value', (snapshot) => {
        const tbody = document.getElementById('leaderboard-body');
        tbody.innerHTML = "";
        snapshot.forEach((child) => {
            const user = child.key;
            const data = child.val();
            tbody.innerHTML += `<tr>
                <td>${data.status === 'online' ? '🟢' : '⚪'}</td>
                <td>${user}</td>
                <td><button onclick="invitePlayer('${user}')">Invite</button></td>
            </tr>`;
        });
    });
}

function invitePlayer(target) {
    database.ref('invites').push({ from: myUsername, to: target, fromPeerId: peer.id });
    alert("Invite sent to " + target);
}

database.ref('invites').on('child_added', (snap) => {
    const invite = snap.val();
    if (invite.to === myUsername) {
        if (confirm(invite.from + " wants to play!")) {
            let conn = peer.connect(invite.fromPeerId);
            conn.on('open', () => alert("Connected!"));
        }
        snap.ref.remove();
    }
});

window.addEventListener("beforeunload", () => {
    database.ref('users/' + myUsername).update({ status: 'offline' });
});
