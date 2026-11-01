import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBfzGjjM7Tg2lKLug53CC7eHbr3Jpl-6vk",
  authDomain: "doisa-8ea91.firebaseapp.com",
  projectId: "doisa-8ea91",
  storageBucket: "doisa-8ea91.firebasestorage.app",
  messagingSenderId: "735040561115",
  appId: "1:735040561115:web:5bb7496fcddf4f8652d1fe"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);

let currentChatId = null;
let stopRequests = null;
let stopChats = null;
let stopMessages = null;

function showMessage(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

// REGISTER
$("registerBtn").onclick = async () => {
  const name = $("displayName").value.trim();
  const phone = $("phone").value.trim();
  const email = $("email").value.trim();
  const password = $("password").value;

  if (!name || !phone || !email || !password) {
    return showMessage("authMessage", "Fill all fields.");
  }

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) {
    return showMessage("authMessage", "Invalid username.");
  }

  if (!/^\+?[0-9]{9,15}$/.test(phone)) {
    return showMessage("authMessage", "Invalid phone number.");
  }

  let newUser = null;
  let stage = "Creating account";

  try {
    const username = name.toLowerCase();

    const result = await createUserWithEmailAndPassword(
      auth, email, password
    );

    newUser = result.user;
    stage = "Checking username";

    const usernameRef = doc(db, "usernames", username);
    const existing = await getDoc(usernameRef);

    if (existing.exists()) {
      await deleteUser(newUser);
      newUser = null;
      return showMessage("authMessage", "Username already used.");
    }

    await updateProfile(newUser, { displayName: name });

    stage = "Saving user profile";

    await setDoc(doc(db, "users", newUser.uid), {
      username,
      phone,
      createdAt: serverTimestamp()
    });

    stage = "Saving username";

    await setDoc(usernameRef, {
      uid: newUser.uid,
      username
    });

    stage = "Creating public profile";

    await setDoc(doc(db, "publicProfiles", newUser.uid), {
      username,
      photoData: "",
      updatedAt: serverTimestamp()
    });

    showMessage("authMessage", "Account created successfully!");

  } catch (error) {
    console.error("REGISTER ERROR:", stage, error);
    showMessage("authMessage", stage + " failed: " + error.code);
  }
};

// LOGIN
$("loginBtn").onclick = async () => {
  try {
    await signInWithEmailAndPassword(
      auth,
      $("email").value.trim(),
      $("password").value
    );
  } catch (error) {
    console.error(error);
    showMessage("authMessage", error.message);
  }
};

// FORGOT PASSWORD
$("forgotBtn").onclick = async () => {
  const email = $("email").value.trim();

  if (!email) {
    return showMessage("authMessage", "Enter your email.");
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("authMessage", "Reset email sent.");
  } catch (error) {
    showMessage("authMessage", error.message);
  }
};

// LOGOUT
$("logoutBtn").onclick = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    alert(error.message);
  }
};

// USER SEARCH
$("searchBtn").onclick = async () => {
  const username = $("userSearch").value.trim().toLowerCase();
  const results = $("searchResults");
  const user = auth.currentUser;

  results.replaceChildren();

  if (!user) return;

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return showMessage("searchResults", "Enter a valid username.");
  }

  try {
    const result = await getDoc(doc(db, "usernames", username));

    if (!result.exists()) {
      return showMessage("searchResults", "User not found.");
    }

    const found = result.data();

    if (found.uid === user.uid) {
      return showMessage("searchResults", "This is your account.");
    }

    const name = document.createElement("p");
    name.textContent = "@" + found.username;
    results.appendChild(name);

    const button = document.createElement("button");
    button.textContent = "Send Chat Request";

    button.onclick = async () => {
      button.disabled = true;

      try {
        await addDoc(collection(db, "chatRequests"), {
          from: user.uid,
          to: found.uid,
          status: "pending",
          createdAt: serverTimestamp()
        });

        button.textContent = "Request Sent";

      } catch (error) {
        button.disabled = false;
        alert("Request failed: " + error.message);
      }
    };

    results.appendChild(button);

  } catch (error) {
    showMessage("searchResults", error.message);
  }
};

// INCOMING REQUESTS
function listenRequests(user) {
  const panel = $("requestList");

  if (stopRequests) stopRequests();

  const q = query(
    collection(db, "chatRequests"),
    where("to", "==", user.uid)
  );

  stopRequests = onSnapshot(q, snapshot => {
    panel.replaceChildren();

    snapshot.forEach(item => {
      const data = item.data();

      if (data.status !== "pending") return;

      const row = document.createElement("div");
      const label = document.createElement("p");
      label.textContent = "New chat request";

      const accept = document.createElement("button");
      accept.textContent = "Accept";

      accept.onclick = async () => {
        accept.disabled = true;

        try {
          await updateDoc(item.ref, { status: "accepted" });

          await setDoc(doc(db, "chats", item.id), {
            participants: [data.from, data.to].sort(),
            createdAt: serverTimestamp()
          });

          alert("Request accepted!");

        } catch (error) {
          alert("Accept failed: " + error.message);
          accept.disabled = false;
        }
      };

      const reject = document.createElement("button");
      reject.textContent = "Reject";

      reject.onclick = async () => {
        try {
          await updateDoc(item.ref, { status: "rejected" });
        } catch (error) {
          alert(error.message);
        }
      };

      row.append(label, accept, reject);
      panel.appendChild(row);
    });

  }, error => {
    console.error(error);
    panel.textContent = "Could not load requests.";
  });
}

// FIND USERNAME
async function getUsername(uid) {
  const q = query(
    collection(db, "usernames"),
    where("uid", "==", uid)
  );

  const result = await getDocs(q);

  if (result.empty) return "DOISA User";

  return result.docs[0].data().username;
}

// GET OTHER USER PHOTO FROM FIRESTORE
async function getPublicPhoto(uid) {
  try {
    const result = await getDoc(doc(db, "publicProfiles", uid));

    if (result.exists()) {
      return result.data().photoData || "";
    }
  } catch (error) {
    console.error("PHOTO LOAD ERROR:", error);
  }

  return "";
}

// PRIVATE CHAT LIST
function listenChats(user) {
  if (stopChats) stopChats();

  let list = $("myChats");

  if (!list) {
    list = document.createElement("section");
    list.id = "myChats";
    $("searchPanel").appendChild(list);
  }

  const q = query(
    collection(db, "chats"),
    where("participants", "array-contains", user.uid)
  );

  stopChats = onSnapshot(q, async snapshot => {
    list.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = "My Private Chats";
    list.appendChild(heading);

    const uniqueChats = new Map();

    snapshot.docs.forEach(item => {
      const data = item.data();
      const otherUid = data.participants.find(uid => uid !== user.uid);

      if (!otherUid) return;

      const previous = uniqueChats.get(otherUid);

      if (!previous) {
        uniqueChats.set(otherUid, item);
      } else {
        const oldTime = previous.data().createdAt?.toMillis() || 0;
        const newTime = data.createdAt?.toMillis() || 0;

        if (newTime > oldTime) uniqueChats.set(otherUid, item);
      }
    });

    if (uniqueChats.size === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No private chats yet.";
      list.appendChild(empty);
      return;
    }

    for (const [otherUid, item] of uniqueChats) {
      let username = "DOISA User";

      try {
        username = await getUsername(otherUid);
      } catch (error) {
        console.error(error);
      }

      const button = document.createElement("button");
      button.className = "chat-list-button";
      button.textContent = "@" + username;

      button.onclick = () => {
        openChat(item.id, item.data(), user, username);
      };

      list.appendChild(button);
    }

  }, error => {
    console.error("CHAT LIST ERROR:", error);
    list.textContent = "Could not load chats.";
  });
}

// OPEN CHAT
async function openChat(chatId, chatData, user, username) {
  if (!chatData.participants?.includes(user.uid)) return;

  currentChatId = chatId;

  $("searchPanel").hidden = true;
  $("requestsPanel").hidden = true;
  $("privateChatPanel").hidden = false;
  $("chatWithName").textContent = "@" + username;

  const otherUid = chatData.participants.find(uid => uid !== user.uid);
  const chatPhoto = $("chatProfilePhoto");

  if (chatPhoto) {
    chatPhoto.src = "https://placehold.co/100x100";

    const photo = await getPublicPhoto(otherUid);

    if (currentChatId === chatId && photo) {
      chatPhoto.src = photo;
    }
  }

  if (stopMessages) stopMessages();

  $("privateMessages").replaceChildren();

  let firstLoad = true;

  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "asc")
  );

  stopMessages = onSnapshot(q, snapshot => {
    const box = $("privateMessages");

    snapshot.docChanges().forEach(change => {
      if (change.type !== "added") return;

      const data = change.doc.data();
      const p = document.createElement("p");

      p.className =
        data.senderId === user.uid ? "sent" : "received";

      p.textContent = data.text;

      if (!firstLoad) p.classList.add("message-enter");

      box.appendChild(p);
    });

    firstLoad = false;
    box.scrollTop = box.scrollHeight;

  }, error => {
    console.error("MESSAGE LIST ERROR:", error);
    $("privateMessages").textContent = "Could not load messages.";
  });
}

// SEND MESSAGE
$("privateMessageForm").onsubmit = async event => {
  event.preventDefault();

  const user = auth.currentUser;
  const message = $("privateMessageInput").value.trim();

  if (!user || !currentChatId || !message) return;

  try {
    await addDoc(
      collection(db, "chats", currentChatId, "messages"),
      {
        text: message,
        senderId: user.uid,
        createdAt: serverTimestamp()
      }
    );

    $("privateMessageInput").value = "";

  } catch (error) {
    alert("Message failed: " + error.message);
  }
};

// BACK BUTTON
$("backBtn").onclick = () => {
  if (stopMessages) stopMessages();

  stopMessages = null;
  currentChatId = null;

  $("privateChatPanel").hidden = true;
  $("searchPanel").hidden = false;
  $("requestsPanel").hidden = false;
};

// PROFILE PHOTO
const photoInput = $("photoInput");
const profilePhoto = $("profilePhoto");
const saveProfileBtn = $("saveProfileBtn");
const profileMessage = $("profileMessage");

let selectedPhoto = null;

function loadProfilePhoto(user) {
  if (!user || !profilePhoto) return;

  profilePhoto.src = "https://placehold.co/100x100";

  getPublicPhoto(user.uid).then(photo => {
    if (auth.currentUser?.uid === user.uid && photo) {
      profilePhoto.src = photo;
    }
  });
}

// COMPRESS PHOTO TO SMALL JPEG
function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 250;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));

        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL("image/jpeg", 0.65));
      };

      image.onerror = reject;
      image.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

if (photoInput && saveProfileBtn && profileMessage && profilePhoto) {
  photoInput.addEventListener("change", () => {
    selectedPhoto = photoInput.files[0];

    if (!selectedPhoto) return;

    if (!selectedPhoto.type.startsWith("image/")) {
      profileMessage.textContent = "Choose an image.";
      selectedPhoto = null;
      return;
    }

    profilePhoto.src = URL.createObjectURL(selectedPhoto);
    profileMessage.textContent = "Photo selected!";
  });

  saveProfileBtn.addEventListener("click", async () => {
    const user = auth.currentUser;

    if (!user) {
      profileMessage.textContent = "Please login first.";
      return;
    }

    if (!selectedPhoto) {
      profileMessage.textContent = "Choose a photo first.";
      return;
    }

    saveProfileBtn.disabled = true;
    profileMessage.textContent = "Saving photo...";

    try {
      const photoData = await compressPhoto(selectedPhoto);

      if (photoData.length > 150000) {
        throw new Error("Photo is too large. Choose another photo.");
      }

      const username = await getUsername(user.uid);

      await setDoc(
        doc(db, "publicProfiles", user.uid),
        {
          username,
          photoData,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      profilePhoto.src = photoData;
      profileMessage.textContent = "Profile photo saved!";
      selectedPhoto = null;
      photoInput.value = "";

    } catch (error) {
      console.error("SAVE PHOTO ERROR:", error);
      profileMessage.textContent = "Could not save: " + error.message;

    } finally {
      saveProfileBtn.disabled = false;
    }
  });
}

// AUTH STATE
onAuthStateChanged(auth, user => {
  if (stopRequests) stopRequests();
  if (stopChats) stopChats();
  if (stopMessages) stopMessages();

  stopRequests = null;
  stopChats = null;
  stopMessages = null;
  currentChatId = null;

  if (user) {
    $("authPanel").hidden = true;
    $("chatPanel").hidden = false;

    $("profileName").textContent =
      "Welcome, " + (user.displayName || "DOISA User");

    $("searchPanel").hidden = false;
    $("requestsPanel").hidden = false;
    $("privateChatPanel").hidden = true;

    loadProfilePhoto(user);
    listenRequests(user);
    listenChats(user);

  } else {
    $("authPanel").hidden = false;
    $("chatPanel").hidden = true;
  }
});