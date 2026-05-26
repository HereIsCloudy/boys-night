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

let peer, myUsername;

function saveUsername() {
    const input = document.getElementById('username-input').value.trim();
    if (!input) return alert("Enter a name!");
    
    myUsername = input;
    document.getElementById('username-modal').style.display = 'none';
    initializePeerConnection();
}

function initializePeerConnection() {
    peer = new Peer();
    peer.on('open', (id) => {
        const userRef = database.ref('users/' + myUsername);
        userRef.set({ status: 'online', peerId: id });
        userRef.onDisconnect().remove();
        listenForInvites();
    });
}

function listenForInvites() {
    database.ref('invites').on('child_added', (snap) => {
        const invite = snap.val();
        if (invite.to === myUsername) {
            if (confirm(invite.from + " challenged you!")) {
                let conn = peer.connect(invite.fromPeerId);
                conn.on('open', () => alert("Game Started!"));
            }
            snap.ref.remove();
        }
    });
}

function invitePlayer(targetUsername) {
    database.ref('users/' + targetUsername + '/peerId').once('value', (snap) => {
        const targetPeerId = snap.val();
        if (targetPeerId) {
            database.ref('invites').push({
                from: myUsername,
                to: targetUsername,
                fromPeerId: peer.id
            });
            alert("Invite sent!");
        }
    });
}
