// 1. Firebase Config (PASTE YOUR OWN KEY HERE)
const firebaseConfig = {
    // Paste your Firebase Config Object from the Firebase Console
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 2. PeerJS Setup
let peer = new Peer();

peer.on('open', (id) => {
    console.log("Connected to Network. Peer ID: " + id);
});

// 3. Online Status System
function setOnlineStatus(username, status) {
    if(username) database.ref('users/' + username).update({ status: status });
}

// 4. Invite Logic
function invitePlayer(targetUsername) {
    database.ref('invites').push({
        from: "YourName", // Change this to your actual username variable
        to: targetUsername,
        fromPeerId: peer.id
    });
    alert("Invite sent!");
}
