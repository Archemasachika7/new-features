// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDlFYzg5Te2jz-kVKXd0yGYlJkMwU9fxss",
  authDomain: "ju-civil-a-martian.firebaseapp.com",
  projectId: "ju-civil-a-martian",
  storageBucket: "ju-civil-a-martian.appspot.com",
  messagingSenderId: "247448010406",
  appId: "1:247448010406:web:a2efa79a4080513cc87e67",
  measurementId: "G-BXYMLKE395"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

// --- Loading Overlay ---
// Global loading counter to track nested loading operations
let loadingCounter = 0;
let loadingTimeout = null;

function showLoading() {
  // Increment the loading counter
  loadingCounter++;
  
  // Get the loading overlay
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'flex';
  }
  
  // Set a safety timeout to hide loading after 10 seconds
  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
  }
  
  loadingTimeout = setTimeout(() => {
    console.warn('Loading timeout reached. Forcing hide loading overlay.');
    hideLoading(true);
  }, 10000);
}

function hideLoading(force = false) {
  // Decrement the loading counter
  if (loadingCounter > 0) {
    loadingCounter--;
  }
  
  // Only hide if counter is 0 or force is true
  if (loadingCounter === 0 || force) {
    // Reset counter if forced
    if (force) {
      loadingCounter = 0;
    }
    
    // Clear the safety timeout
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      loadingTimeout = null;
    }
    
    // Hide the loading overlay
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
  }
}

// --- Mobile Navigation Menu ---
const hamburger = document.querySelector(".hamburger");
const navMenu = document.querySelector(".nav-menu");

if (hamburger) {
  hamburger.addEventListener("click", mobileMenu);
}

function mobileMenu() {
  hamburger.classList.toggle("active");
  navMenu.classList.toggle("active");
}

// Close mobile menu when clicking a nav item
const navLinks = document.querySelectorAll(".nav-item");

navLinks.forEach(n => n.addEventListener("click", closeMenu));

function closeMenu() {
  hamburger.classList.remove("active");
  navMenu.classList.remove("active");
}

// --- SGPA Upload and CGPA Calculation ---
let userSGPAData = {};

// CGPA Calculation weights
const cgpaWeights = {
  1: 0.1, 2: 0.1,  // Semesters 1-2: 0.1 each
  3: 0.2, 4: 0.2,  // Semesters 3-4: 0.2 each  
  5: 0.35, 6: 0.35, // Semesters 5-6: 0.35 each
  7: 0.35, 8: 0.35  // Semesters 7-8: 0.35 each
};

// Upload SGPA functionality
document.addEventListener('DOMContentLoaded', function() {
  const uploadBtn = document.getElementById('uploadSgpaBtn');
  if (uploadBtn) {
    uploadBtn.onclick = function() {
      const semester = document.getElementById('semesterSelect').value;
      const sgpa = parseFloat(document.getElementById('sgpaInput').value);
      
      if (!semester || isNaN(sgpa) || sgpa < 0 || sgpa > 10) {
        showAlert("Please select a valid semester and enter SGPA between 0-10", "#ff3b30");
        return;
      }
      
      const userId = auth.currentUser.uid;
      
      showLoading();
      
      // Update user's SGPA data in Firestore
      db.collection("users").doc(userId).update({
        [`sgpa.sem${semester}`]: sgpa,
        lastUpdated: new Date().toISOString()
      }).then(() => {
        showAlert("SGPA uploaded successfully!", "#1bbf3b");
        
        // Clear inputs
        document.getElementById('semesterSelect').value = '';
        document.getElementById('sgpaInput').value = '';
        
        // Reload user data and recalculate
        loadUserAcademicData();
      }).catch(error => {
        console.error("Error uploading SGPA:", error);
        showAlert("Error uploading SGPA: " + error.message, "#ff3b30");
      }).finally(() => {
        hideLoading();
      });
    };
  }
});

// Load user academic data and calculate CGPA
function loadUserAcademicData() {
  const userId = auth.currentUser.uid;
  
  db.collection("users").doc(userId).get().then(doc => {
    if (doc.exists) {
      const userData = doc.data();
      userSGPAData = userData.sgpa || {};
      
      // Calculate CGPA
      const cgpa = calculateCGPA(userSGPAData);
      const cgpaElement = document.getElementById('cgpaValue');
      if (cgpaElement) {
        cgpaElement.textContent = cgpa.toFixed(2);
      }
      
      // Calculate and display rank
      calculateUserRank(cgpa);
      
      // Update performance graph
      updatePerformanceGraph();
    }
  }).catch(error => {
    console.error("Error loading academic data:", error);
  });
}

// Calculate CGPA using the specified formula
function calculateCGPA(sgpaData) {
  let totalWeightedScore = 0;
  let totalWeight = 0;
  
  for (let sem = 1; sem <= 8; sem++) {
    const sgpa = sgpaData[`sem${sem}`];
    if (sgpa !== undefined && sgpa !== null) {
      totalWeightedScore += sgpa * cgpaWeights[sem];
      totalWeight += cgpaWeights[sem];
    }
  }
  
  return totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
}

// Calculate user rank among all students
function calculateUserRank(userCGPA) {
  db.collection("users").get().then(snapshot => {
    const allCGPAs = [];
    
    snapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.sgpa) {
        const cgpa = calculateCGPA(userData.sgpa);
        if (cgpa > 0) {
          allCGPAs.push(cgpa);
        }
      }
    });
    
    // Sort CGPAs in descending order
    allCGPAs.sort((a, b) => b - a);
    
    // Find user's rank
    const rank = allCGPAs.findIndex(cgpa => cgpa <= userCGPA) + 1;
    const totalStudents = allCGPAs.length;
    
    const rankElement = document.getElementById('rankValue');
    if (rankElement) {
      rankElement.textContent = totalStudents > 0 ? `${rank}/${totalStudents}` : '--';
    }
  }).catch(error => {
    console.error("Error calculating rank:", error);
    const rankElement = document.getElementById('rankValue');
    if (rankElement) {
      rankElement.textContent = '--';
    }
  });
}

// Update performance graph
function updatePerformanceGraph() {
  const canvas = document.getElementById('performanceGraph');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // Set canvas size
  canvas.width = canvas.offsetWidth;
  canvas.height = 200;
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Get SGPA data for graph
  const semesters = [];
  const sgpaValues = [];
  
  for (let sem = 1; sem <= 8; sem++) {
    if (userSGPAData[`sem${sem}`] !== undefined) {
      semesters.push(sem);
      sgpaValues.push(userSGPAData[`sem${sem}`]);
    }
  }
  
  if (sgpaValues.length === 0) {
    // Show message if no data
    ctx.fillStyle = '#ffffffcc';
    ctx.font = '14px Roboto';
    ctx.textAlign = 'center';
    ctx.fillText('Upload SGPA data to see your performance graph', canvas.width/2, canvas.height/2);
    return;
  }
  
  // Draw graph
  const padding = 40;
  const graphWidth = canvas.width - 2 * padding;
  const graphHeight = canvas.height - 2 * padding;
  
  // Draw axes
  ctx.strokeStyle = '#ff8a00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, canvas.height - padding);
  ctx.lineTo(canvas.width - padding, canvas.height - padding);
  ctx.stroke();
  
  // Draw data points and lines
  if (sgpaValues.length > 1) {
    ctx.strokeStyle = '#ff8a00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    for (let i = 0; i < sgpaValues.length; i++) {
      const x = padding + (i / (sgpaValues.length - 1)) * graphWidth;
      const y = canvas.height - padding - (sgpaValues[i] / 10) * graphHeight;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      
      // Draw point
      ctx.fillStyle = '#ff8a00';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.stroke();
  }
  
  // Add labels
  ctx.fillStyle = '#ffffffcc';
  ctx.font = '12px Roboto';
  ctx.textAlign = 'center';
  ctx.fillText('Semester Progress', canvas.width/2, canvas.height - 10);
}

// --- Profile Picture Upload ---
document.addEventListener('DOMContentLoaded', function() {
  const profilePicInput = document.getElementById('profilePicInput');
  if (profilePicInput) {
    profilePicInput.onchange = function(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      // Validate file type
      if (!file.type.includes('image')) {
        showAlert('Please select an image file', '#ff3b30');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5000000) {
        showAlert('Image size should be less than 5MB', '#ff3b30');
        return;
      }
      
      showLoading();
      
      const userId = auth.currentUser.uid;
      const storageRef = storage.ref(`profile-pictures/${userId}`);
      
      // Upload to Firebase Storage
      storageRef.put(file).then(snapshot => {
        return snapshot.ref.getDownloadURL();
      }).then(downloadURL => {
        // Update user document with profile picture URL
        return db.collection("users").doc(userId).update({
          profilePicture: downloadURL
        });
      }).then(() => {
        // Update display
        const profileDisplay = document.getElementById('profilePicDisplay');
        if (profileDisplay) {
          profileDisplay.innerHTML = 
            `<img src="${downloadURL}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover;">`;
        }
        showAlert('Profile picture updated successfully!', '#1bbf3b');
      }).catch(error => {
        console.error('Error uploading profile picture:', error);
        showAlert('Error uploading profile picture: ' + error.message, '#ff3b30');
      }).finally(() => {
        hideLoading();
      });
    };
  }
});

// Load existing profile picture
function loadUserProfilePicture() {
  const userId = auth.currentUser.uid;
  db.collection("users").doc(userId).get().then(doc => {
    if (doc.exists && doc.data().profilePicture) {
      const profileDisplay = document.getElementById('profilePicDisplay');
      if (profileDisplay) {
        profileDisplay.innerHTML = 
          `<img src="${doc.data().profilePicture}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover;">`;
      }
    }
  });
}

// --- LinkedIn Suggestions ---
function loadLinkedInSuggestions() {
  const userId = auth.currentUser.uid;
  
  showLoading();
  
  // Get current user's subsection
  db.collection("users").doc(userId).get().then(userDoc => {
    const currentUserData = userDoc.data();
    const userSubsection = currentUserData.subsection || "A1";
    
    // Get other users from the same subsection with LinkedIn profiles
    db.collection("users")
      .where("subsection", "==", userSubsection)
      .limit(10)
      .get()
      .then(snapshot => {
        const suggestions = [];
        
        snapshot.forEach(doc => {
          const userData = doc.data();
          
          // Skip current user and users without LinkedIn
          if (doc.id !== userId && userData.linkedinProfile) {
            suggestions.push({
              id: doc.id,
              name: userData.name,
              subsection: userData.subsection,
              linkedinUrl: userData.linkedinProfile
            });
          }
        });
        
        // Shuffle and take 5 random suggestions
        const randomSuggestions = suggestions
          .sort(() => Math.random() - 0.5)
          .slice(0, 5);
        
        renderLinkedInSuggestions(randomSuggestions);
      });
  }).catch(error => {
    console.error("Error loading LinkedIn suggestions:", error);
    const container = document.getElementById('linkedinSuggestions');
    if (container) {
      container.innerHTML = '<div class="no-suggestions">Error loading suggestions</div>';
    }
  }).finally(() => {
    hideLoading();
  });
}

function renderLinkedInSuggestions(suggestions) {
  const container = document.getElementById('linkedinSuggestions');
  if (!container) return;
  
  if (suggestions.length === 0) {
    container.innerHTML = `
      <div class="no-suggestions">
        <p>No LinkedIn profiles found among your classmates.</p>
        <p>Encourage them to add their LinkedIn profiles!</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  
  suggestions.forEach(suggestion => {
    const profileCard = document.createElement('div');
    profileCard.className = 'linkedin-profile-card';
    
    // Generate avatar with initials
    const initials = suggestion.name.split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
    
    profileCard.innerHTML = `
      <div class="profile-avatar">${initials}</div>
      <div class="profile-info">
        <div class="profile-name">${suggestion.name}</div>
        <div class="profile-subsection">Subsection ${suggestion.subsection}</div>
        <button class="connect-btn" onclick="window.open('${suggestion.linkedinUrl}', '_blank')">
          Connect on LinkedIn
        </button>
      </div>
    `;
    
    container.appendChild(profileCard);
  });
}

// Refresh suggestions button
document.addEventListener('DOMContentLoaded', function() {
  const refreshBtn = document.getElementById('refreshSuggestions');
  if (refreshBtn) {
    refreshBtn.onclick = function() {
      loadLinkedInSuggestions();
    };
  }
});

// --- SESSION CHECK & USER GREETING ---
// Show loading while checking authentication
showLoading();

// Check if user is authenticated
auth.onAuthStateChanged(user => {
  if (!user) {
    // User is not authenticated, redirect to auth page
    hideLoading(true);
    window.location.href = "auth/index.html";
    return;
  }
  
  // Get user data from Firestore using UID
  db.collection("users").doc(user.uid).get()
    .then(userDoc => {
      if (!userDoc.exists) {
        console.log("No user document found!");
        // Create a basic user document if it doesn't exist
        return db.collection("users").doc(user.uid).set({
          name: user.displayName || "Martian User",
          email: user.email,
          subsection: "A1",
          isAdmin: false,
          createdAt: new Date().toISOString()
        }).then(() => {
          typeGreeting(`Hi, ${user.displayName || 'Martian'}! 🚀`);
          window.userSubsection = "A1";
          setActiveSubsectionBtn(window.userSubsection);
          renderSchedule(window.userSubsection);
        });
      }
      
      const userData = userDoc.data();
      // Set user greeting with name from authentication
      typeGreeting(`Hi, ${userData.name || user.displayName || 'Martian'}! 🚀`);
      
      // Set user subsection
      window.userSubsection = userData.subsection || "A1";
      setActiveSubsectionBtn(window.userSubsection);
      
      // Check if user is admin
      if (userData.isAdmin) {
        // Add admin badge or button
        const adminBtn = document.createElement('button');
        adminBtn.className = 'nav-btn admin-btn';
        adminBtn.innerHTML = '<span>👑</span> Admin';
        adminBtn.onclick = () => window.location.href = "admin.html";
        const profileBtn = document.getElementById('profileBtn');
        if (profileBtn && profileBtn.parentNode) {
          document.querySelector('.nav-menu').insertBefore(adminBtn, profileBtn.parentNode);
        }
      }
      
      // Load schedule for user's subsection
      renderSchedule(window.userSubsection);
      
      // Load user profile picture
      loadUserProfilePicture();
    })
    .catch(error => {
      console.error("Error fetching user data:", error);
      typeGreeting(`Hi, Martian! 🚀`);
    })
    .finally(() => {
      // Hide loading after user data is fetched
      hideLoading();
      
      // Set up real-time listeners for all data
      setupRealTimeListeners();
      
      // Clean up expired events
      cleanupExpiredEvents();
    });
});

// --- Set up all real-time listeners ---
function setupRealTimeListeners() {
  try {
    // Setup all the real-time listeners
    loadAnnouncementsRealTime();
    loadResourcesRealTime();
    loadGalleryRealTime();
    loadEventsRealTime();
    loadProjectsRealTime();
    loadPollsRealTime();
    
    // Load new features
    loadUserAcademicData();
    loadLinkedInSuggestions();
    
    // Setup knowledge bubble rotation
    setupKnowledgeBubble();
    
    // Create starry background
    createTwinklingStars();
  } catch (error) {
    console.error("Error setting up real-time listeners:", error);
    hideLoading(true);
  }
}

// --- Automatic Event Cleanup ---
function cleanupExpiredEvents() {
  const now = new Date();
  const thirtyMinutesInMs = 30 * 60 * 1000;
  
  db.collection("events").get().then(snapshot => {
    snapshot.forEach(doc => {
      const event = doc.data();
      const eventDateTime = new Date(`${event.date}T${event.time}`);
      const expiryTime = new Date(eventDateTime.getTime() + thirtyMinutesInMs);
      
      if (now > expiryTime) {
        // Event has expired, delete it
        db.collection("events").doc(doc.id).delete()
          .then(() => console.log(`Expired event deleted: ${event.title}`))
          .catch(error => console.error("Error deleting expired event:", error));
      }
    });
  }).catch(error => {
    console.error("Error checking for expired events:", error);
  });
}

// --- LOGOUT ---
document.getElementById('logoutBtn').onclick = () => {
  showLoading();
  auth.signOut().then(() => {
    window.location.href = "auth/index.html";
  }).catch(error => {
    console.error("Error signing out:", error);
  }).finally(() => {
    hideLoading();
  });
};

// --- PROFILE BUTTON ---
document.getElementById('profileBtn').onclick = () => {
  window.location.href = "profile.html";
};

// --- THEME TOGGLE ---
const themeToggle = document.getElementById('themeToggle');
let darkMode = true;
themeToggle.onclick = () => {
  darkMode = !darkMode;
  document.body.classList.toggle('light', !darkMode);
  themeToggle.innerHTML = darkMode ? "<span>🌓</span> Theme" : "<span>🌞</span> Theme";
};
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
  document.body.classList.add('light');
  themeToggle.innerHTML = "<span>🌞</span> Theme";
  darkMode = false;
}

// --- Animated Personalized Greeting ---
function typeGreeting(text) {
  const el = document.getElementById('userGreeting');
  el.innerHTML = "";
  let i = 0;
  function type() {
    el.innerHTML = text.slice(0, i) + '<span class="type-cursor">|</span>';
    if (i < text.length) {
      i++;
      setTimeout(type, 60);
    } else {
      el.innerHTML = text + '<span class="type-cursor">|</span>';
    }
  }
  type();
}

// --- Announcements with Real-time Updates ---
// Store announcements globally so filters can access the complete data
window.allAnnouncements = [];

function loadAnnouncementsRealTime() {
  showLoading();
  
  // Use onSnapshot for real-time updates
  const unsubscribe = db.collection("announcements")
    .orderBy("date", "desc")
    .onSnapshot(snapshot => {
      // Reset the global announcements array
      window.allAnnouncements = [];
      
      snapshot.forEach(doc => {
        window.allAnnouncements.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      renderAnnouncements(window.allAnnouncements, currentAnnFilter);
      hideLoading();
    }, error => {
      console.error("Error loading announcements:", error);
      hideLoading();
    });
  
  return unsubscribe;
}

let currentAnnFilter = "all";
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.onclick = function() {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentAnnFilter = btn.dataset.filter;
    
    // Always use the complete dataset from global variable
    renderAnnouncements(window.allAnnouncements, currentAnnFilter);
  };
});

function renderAnnouncements(announcements, filter = "all") {
  const feed = document.getElementById('announcementsFeed');
  feed.innerHTML = "";
  let filtered = [...announcements]; // Create a copy to avoid modifying the original
  
  if (filter === "today") {
    // Fix date comparison by getting today's date in the same format as stored dates
    const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    filtered = announcements.filter(a => a.date === today);
  } else if (filter === "high") {
    filtered = announcements.filter(a => a.priority === "high");
  }
  
  if (filtered.length === 0) {
    feed.innerHTML = "<li class='announcement-card'>No announcements available.</li>";
    return;
  }
  
  filtered.forEach(a => {
    const div = document.createElement('li');
    div.className = "announcement-card " + (a.priority || "");
    div.dataset.id = a.id;
    div.innerHTML = `
      <div class="announcement-left">
        <span class="priority">${a.priority ? a.priority.toUpperCase() : ""}</span>
        <span class="date">${a.date || ""}</span>
      </div>
      <div class="announcement-content">
        <div class="announcement-title">${a.title || ""}</div>
        <div class="announcement-desc">${a.desc || ""}</div>
      </div>
    `;
    feed.appendChild(div);
  });
}

// --- Schedule: Filter by user's subsection ---
function setActiveSubsectionBtn(sub) {
  document.querySelectorAll('.sub-btn').forEach(btn => {
    if (btn.dataset.sub === sub) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

document.querySelectorAll('.sub-btn').forEach(btn => {
  btn.onclick = function() {
    setActiveSubsectionBtn(btn.dataset.sub);
    renderSchedule(btn.dataset.sub);
  };
});

// --- Schedule Rendering using real-time updates ---
function renderSchedule(subsection) {
  console.log(`Fetching schedule for subsection: ${subsection}`);
  
  showLoading();
  
  // Use onSnapshot for real-time updates
  const unsubscribe = db.collection('schedule')
    .where('subsection', '==', subsection)
    .orderBy('date', 'asc')
    .onSnapshot(
      (snapshot) => {
        console.log(`Received ${snapshot.size} schedule items`);
        const timeline = document.getElementById('scheduleTimeline');
        timeline.innerHTML = '';
        
        if (snapshot.empty) {
          console.log('No schedule items found');
          timeline.innerHTML = '<div class="schedule-item">No schedule found for this subsection.</div>';
          hideLoading();
          return;
        }
        
        snapshot.forEach(doc => {
          console.log('Schedule item:', doc.id, doc.data());
          const s = doc.data();
          const div = document.createElement('div');
          div.className = 'schedule-item';
          div.dataset.id = doc.id;
          div.innerHTML = `
            <div class="schedule-time">${s.date || ''}${s.time ? ' ' + s.time : ''}</div>
            <div class="schedule-title">${s.title || ''}</div>
            <div class="schedule-desc">${s.desc || ''}</div>
            <div class="schedule-location">${s.location ? '📍 ' + s.location : ''}</div>
          `;
          timeline.appendChild(div);
        });
        
        hideLoading();
      },
      (error) => {
        console.error('Error fetching schedule:', error);
        const timeline = document.getElementById('scheduleTimeline');
        timeline.innerHTML = `<div class="schedule-item">Error loading schedule: ${error.message}</div>`;
        hideLoading();
      }
    );
  
  // Return unsubscribe function for cleanup
  return unsubscribe;
}

// --- Resources with Real-time Updates and Show More functionality ---
function loadResourcesRealTime() {
  showLoading();
  
  // Use onSnapshot for real-time updates
  const unsubscribe = db.collection("resources")
    .orderBy("uploadedAt", "desc")
    .onSnapshot(snapshot => {
      const allResources = [];
      snapshot.forEach(doc => {
        allResources.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Display only first 4 resources initially
      renderResources(allResources, 4);
      
      // Setup show more button
      setupShowMoreButton('resourcesShowMore', allResources, renderResources);
      
      hideLoading();
    }, error => {
      console.error("Error loading resources:", error);
      hideLoading();
    });
  
  return unsubscribe;
}

function renderResources(resources, limit) {
  const resourcesList = document.getElementById('resourcesList');
  resourcesList.innerHTML = "";
  
  // Limit the number of resources shown
  const limitedResources = resources.slice(0, limit);
  
  if (limitedResources.length === 0) {
    resourcesList.innerHTML = "<li>No resources available.</li>";
    return;
  }
  
  limitedResources.forEach(resource => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="${resource.url}" target="_blank">${resource.title}</a>`;
    resourcesList.appendChild(li);
  });
  
  // Show/hide the show more button based on whether there are more resources
  const showMoreBtn = document.getElementById('resourcesShowMore');
  if (showMoreBtn) {
    showMoreBtn.style.display = resources.length > limit ? 'block' : 'none';
  }
}

// --- Gallery with Real-time Updates and Show More functionality ---
function loadGalleryRealTime() {
  showLoading();
  
  // Use onSnapshot for real-time updates
  const unsubscribe = db.collection("gallery")
    .orderBy("uploadedAt", "desc")
    .onSnapshot(snapshot => {
      const allImages = [];
      snapshot.forEach(doc => {
        allImages.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Display only first 12 images initially (3 per row, 4 rows)
      renderGallery(allImages, 12);
      
      // Setup show more button
      setupShowMoreButton('galleryShowMore', allImages, renderGallery);
      
      hideLoading();
    }, error => {
      console.error("Error loading gallery:", error);
      hideLoading();
    });
  
  return unsubscribe;
}

function renderGallery(images, limit) {
  const galleryGrid = document.querySelector('.gallery-grid-preview');
  galleryGrid.innerHTML = "";
  
  // Limit the number of images shown
  const limitedImages = images.slice(0, limit);
  
  if (limitedImages.length === 0) {
    galleryGrid.innerHTML = "<div class='gallery-img-card'>No images available.</div>";
    return;
  }
  
  limitedImages.forEach(image => {
    const card = document.createElement('div');
    card.className = 'gallery-img-card';
    card.innerHTML = `
      <img src="${image.imgUrl}" alt="${image.title || 'Gallery image'}" class="carousel-img">
      <div class="gallery-img-title">${image.title || ""}</div>
    `;
    galleryGrid.appendChild(card);
  });
  
  // Show/hide the show more button based on whether there are more images
  const showMoreBtn = document.getElementById('galleryShowMore');
  if (showMoreBtn) {
    showMoreBtn.style.display = images.length > limit ? 'block' : 'none';
  }
}

// Helper function for "Show More" buttons
function setupShowMoreButton(buttonId, items, renderFunction) {
  const showMoreBtn = document.getElementById(buttonId);
  if (!showMoreBtn) return;
  
  // Store current limit in the button's data attribute
  let currentLimit = parseInt(showMoreBtn.dataset.limit || '0');
  const initialLimit = buttonId === 'resourcesShowMore' ? 4 : 12;
  const incrementAmount = buttonId === 'resourcesShowMore' ? 4 : 12;
  
  if (currentLimit === 0) {
    currentLimit = initialLimit;
    showMoreBtn.dataset.limit = currentLimit.toString();
  }
  
  showMoreBtn.onclick = function() {
    currentLimit += incrementAmount;
    showMoreBtn.dataset.limit = currentLimit.toString();
    renderFunction(items, currentLimit);
  };
}

// --- Events & Modernized Countdown with fireworks ---
function loadEventsRealTime() {
  showLoading();
  
  // Use onSnapshot for real-time updates
  const unsubscribe = db.collection("events")
    .orderBy("date", "asc")
    .onSnapshot(snapshot => {
      const eventsList = document.querySelector('.events-list');
      eventsList.innerHTML = "";
      
      const events = [];
      snapshot.forEach(doc => {
        events.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Filter for upcoming events
      const today = new Date().toISOString().split('T')[0];
      const upcomingEvents = events.filter(event => event.date >= today);
      
      if (upcomingEvents.length === 0) {
        eventsList.innerHTML = `
          <div class="no-events">
            <p>No upcoming events scheduled at this time.</p>
            <p>Check back soon for exciting Martian activities!</p>
          </div>
        `;
      } else {
        // Set up countdown for the next event
        setupEventCountdown();
        
        // Display upcoming events list
        const eventsHeader = document.createElement('h3');
        eventsHeader.className = 'upcoming-events-header';
        eventsHeader.textContent = 'Upcoming Events';
        eventsList.appendChild(eventsHeader);
        
        upcomingEvents.slice(0, 3).forEach(event => {
          const eventCard = document.createElement('div');
          eventCard.className = 'event-card';
          
          const eventDate = new Date(event.date + 'T' + (event.time || '00:00:00'));
          const formattedDate = eventDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          });
          
          const formattedTime = event.time ? 
            eventDate.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit'
            }) : 'All Day';
          
          eventCard.innerHTML = `
            <div class="event-header">
              <div class="event-title">${event.title}</div>
              <div class="event-date-time">${formattedDate} at ${formattedTime}</div>
            </div>
            <div class="event-description">${event.description || event.desc || ""}</div>
            <div class="event-location">📍 ${event.location || 'TBA'}</div>
          `;
          
          eventsList.appendChild(eventCard);
        });
        
        // Add "View All" button if there are more events
        if (upcomingEvents.length > 3) {
          const viewAllBtn = document.createElement('button');
          viewAllBtn.className = 'view-all-btn';
          viewAllBtn.textContent = 'View All Events';
          viewAllBtn.onclick = () => window.location.href = "events.html";
          eventsList.appendChild(viewAllBtn);
        }
      }
      
      hideLoading();
    }, error => {
      console.error("Error loading events:", error);
      hideLoading();
    });
  
  return unsubscribe;
}

// Modernized countdown timer with fireworks
function setupEventCountdown() {
  // Get the next event from Firestore
  db.collection("events")
    .orderBy("date", "asc")
    .where("date", ">=", new Date().toISOString().split('T')[0])
    .limit(1)
    .get()
    .then(snapshot => {
      if (snapshot.empty) {
        document.getElementById('eventCountdown').innerHTML = '<div class="no-events">No upcoming events scheduled</div>';
        return;
      }
      
      const event = snapshot.docs[0].data();
      const eventDate = new Date(event.date + 'T' + (event.time || '00:00:00'));
      
      // Set up the countdown
      createModernCountdown('eventCountdown', eventDate, event.title);
    })
    .catch(error => {
      console.error("Error fetching next event:", error);
    });
}

function createModernCountdown(elementId, targetDate, eventTitle) {
  const countdownElement = document.getElementById(elementId);
  
  // Create countdown container
  const countdownContainer = document.createElement('div');
  countdownContainer.className = 'modern-countdown';
  
  // Add event title
  const titleElement = document.createElement('div');
  titleElement.className = 'countdown-event-title';
  titleElement.textContent = eventTitle;
  countdownContainer.appendChild(titleElement);
  
  // Create countdown display
  const countdownDisplay = document.createElement('div');
  countdownDisplay.className = 'countdown-display';
  
  // Create units (days, hours, minutes, seconds)
  const units = ['days', 'hours', 'minutes', 'seconds'];
  units.forEach(unit => {
    const unitContainer = document.createElement('div');
    unitContainer.className = 'countdown-unit';
    
    const valueElement = document.createElement('div');
    valueElement.className = 'countdown-value';
    valueElement.id = `countdown-${unit}`;
    valueElement.textContent = '00';
    
    const labelElement = document.createElement('div');
    labelElement.className = 'countdown-label';
    labelElement.textContent = unit;
    
    unitContainer.appendChild(valueElement);
    unitContainer.appendChild(labelElement);
    countdownDisplay.appendChild(unitContainer);
  });
  
  countdownContainer.appendChild(countdownDisplay);
  
  // Create canvas for fireworks
  const fireworksCanvas = document.createElement('canvas');
  fireworksCanvas.id = 'countdown-fireworks';
  fireworksCanvas.className = 'countdown-fireworks';
  fireworksCanvas.style.display = 'none';
  countdownContainer.appendChild(fireworksCanvas);
  
  // Add to DOM
  countdownElement.innerHTML = '';
  countdownElement.appendChild(countdownContainer);
  
  // Start the countdown
  startCountdown(targetDate, units, fireworksCanvas);
}

function startCountdown(targetDate, units, fireworksCanvas) {
  const countdownInterval = setInterval(() => {
    const now = new Date().getTime();
    const distance = targetDate - now;
    
    // Calculate time units
    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
    
    // Update the countdown display
    const daysEl = document.getElementById('countdown-days');
    const hoursEl = document.getElementById('countdown-hours');
    const minutesEl = document.getElementById('countdown-minutes');
    const secondsEl = document.getElementById('countdown-seconds');
    
    if (daysEl) daysEl.textContent = days.toString().padStart(2, '0');
    if (hoursEl) hoursEl.textContent = hours.toString().padStart(2, '0');
    if (minutesEl) minutesEl.textContent = minutes.toString().padStart(2, '0');
    if (secondsEl) secondsEl.textContent = seconds.toString().padStart(2, '0');
    
    // If the countdown is over
    if (distance < 0) {
      clearInterval(countdownInterval);
      if (daysEl) daysEl.textContent = '00';
      if (hoursEl) hoursEl.textContent = '00';
      if (minutesEl) minutesEl.textContent = '00';
      if (secondsEl) secondsEl.textContent = '00';
      
      // Show "Event Started" message
      const countdownDisplay = document.querySelector('.countdown-display');
      if (countdownDisplay) {
        countdownDisplay.innerHTML = '<div class="event-started">Event has started!</div>';
      }
      
      // Show fireworks
      fireworksCanvas.style.display = 'block';
      startFireworksAnimation(fireworksCanvas);
    }
  }, 1000);
}

function startFireworksAnimation(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  
  // Firework particles array
  let particles = [];
  
  // Firework colors
  const colors = ['#ff8a00', '#ff3b30', '#ffcc00', '#ff9500', '#ffffff'];
  
  // Create a particle
  class Particle {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.velocity = {
        x: -2 + Math.random() * 4,
        y: -2 + Math.random() * 4
      };
      this.alpha = 1;
      this.decay = 0.015 + Math.random() * 0.03;
      this.size = 2 + Math.random() * 3;
    }
    
    draw() {
      ctx.globalAlpha = this.alpha;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
    
    update() {
      this.velocity.y += 0.05;
      this.x += this.velocity.x;
      this.y += this.velocity.y;
      this.alpha -= this.decay;
      
      this.draw();
    }
  }
  
  // Create firework explosion
  function createFirework(x, y) {
    const particleCount = 80 + Math.floor(Math.random() * 50);
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle(x, y, color));
    }
  }
  
  // Animation loop
  function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    particles.forEach((particle, index) => {
      if (particle.alpha <= 0) {
        particles.splice(index, 1);
      } else {
        particle.update();
      }
    });
    
    // Randomly create new fireworks
    if (Math.random() < 0.05 && particles.length < 1000) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height * 0.5;
      createFirework(x, y);
    }
    
    requestAnimationFrame(animate);
  }
  
  // Start animation
  animate();
  
  // Initial fireworks
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      createFirework(
        canvas.width * 0.2 + Math.random() * canvas.width * 0.6,
        canvas.height * 0.2 + Math.random() * canvas.height * 0.3
      );
    }, i * 600);
  }
}

// --- Poll System ---
function loadPollsRealTime() {
  showLoading();
  
  // Use onSnapshot for real-time updates
  const unsubscribe = db.collection("polls")
    .where("isActive", "==", true)
    .orderBy("createdAt", "desc")
    .onSnapshot(snapshot => {
      const pollsContainer = document.getElementById('pollsContainer');
      
      if (snapshot.empty) {
        pollsContainer.innerHTML = `
          <div class="no-polls">
            <p>No active polls at this time.</p>
            <p>Check back later for class polls!</p>
          </div>
        `;
        hideLoading();
        return;
      }
      
      pollsContainer.innerHTML = '';
      
      snapshot.forEach(doc => {
        const poll = doc.data();
        const pollId = doc.id;
        
        // Create poll card
        const pollCard = document.createElement('div');
        pollCard.className = 'poll-card';
        pollCard.dataset.id = pollId;
        
        // Create poll question
        const pollQuestion = document.createElement('div');
        pollQuestion.className = 'poll-question';
        pollQuestion.textContent = poll.question;
        
        // Create poll options container
        const pollOptions = document.createElement('div');
        pollOptions.className = 'poll-options';
        
        // Check if user has already voted
        const userId = auth.currentUser.uid;
        let userVoted = false;
        let selectedOption = null;
        
        // Get poll responses to check if user voted and calculate percentages
        db.collection("pollResponses")
          .where("pollId", "==", pollId)
          .get()
          .then(responsesSnapshot => {
            const responses = [];
            responsesSnapshot.forEach(responseDoc => {
              const response = responseDoc.data();
              responses.push(response);
              
              if (response.userId === userId) {
                userVoted = true;
                selectedOption = response.response;
              }
            });
            
            // Calculate percentages
            const totalVotes = responses.length;
            const voteCounts = poll.options.map(() => 0);
            
            responses.forEach(response => {
              if (response.response >= 0 && response.response < voteCounts.length) {
                voteCounts[response.response]++;
              }
            });
            
            // Create option elements
            poll.options.forEach((option, index) => {
              const percentage = totalVotes > 0 ? Math.round((voteCounts[index] / totalVotes) * 100) : 0;
              
              const optionElement = document.createElement('div');
              optionElement.className = 'poll-option';
              if (userVoted && selectedOption === index) {
                optionElement.classList.add('selected');
              }
              
              // Add progress bar
              const progressBar = document.createElement('div');
              progressBar.className = 'poll-option-progress';
              progressBar.style.width = userVoted ? `${percentage}%` : '0%';
              
              // Add option text
              const optionText = document.createElement('div');
              optionText.className = 'poll-option-text';
              optionText.textContent = option;
              
              // Add percentage if user voted
              if (userVoted) {
                const percentageText = document.createElement('div');
                percentageText.className = 'poll-option-percentage';
                percentageText.textContent = `${percentage}%`;
                optionElement.appendChild(percentageText);
              }
              
              optionElement.appendChild(progressBar);
              optionElement.appendChild(optionText);
              
              // Add click handler if user hasn't voted
              if (!userVoted) {
                optionElement.onclick = function() {
                  // Remove selected class from all options
                  pollOptions.querySelectorAll('.poll-option').forEach(opt => {
                    opt.classList.remove('selected');
                  });
                  
                  // Add selected class to clicked option
                  this.classList.add('selected');
                  
                  // Enable submit button
                  submitButton.disabled = false;
                  
                  // Store selected option index
                  pollCard.dataset.selectedOption = index;
                };
              }
              
              pollOptions.appendChild(optionElement);
            });
            
            // Add submit button if user hasn't voted
            if (!userVoted) {
              const submitButton = document.createElement('button');
              submitButton.className = 'poll-submit';
              submitButton.textContent = 'Submit Vote';
              submitButton.disabled = true;
              submitButton.onclick = function(e) {
                e.preventDefault();
                
                const selectedOptionIndex = parseInt(pollCard.dataset.selectedOption);
                if (isNaN(selectedOptionIndex)) return;
                
                // Submit vote to Firestore
                db.collection("pollResponses").add({
                  pollId: pollId,
                  userId: userId,
                  response: selectedOptionIndex,
                  submittedAt: new Date().toISOString()
                })
                .then(() => {
                  showAlert("Vote submitted successfully!", "#1bbf3b");
                  // Reload polls to show updated results
                  loadPollsRealTime();
                })
                .catch(error => {
                  console.error("Error submitting vote:", error);
                  showAlert("Error submitting vote: " + error.message);
                });
              };
              
              pollCard.appendChild(submitButton);
            } else {
              // Show total votes if user has voted
              const resultsText = document.createElement('div');
              resultsText.className = 'poll-results';
              resultsText.textContent = `Total votes: ${totalVotes}`;
              pollCard.appendChild(resultsText);
            }
            
            // Check if poll has expired
            const now = new Date();
            if (poll.expiresAt && new Date(poll.expiresAt) < now) {
              const expiredText = document.createElement('div');
              expiredText.className = 'poll-expired';
              expiredText.textContent = 'This poll has ended';
              pollCard.appendChild(expiredText);
            }
          })
          .catch(error => {
            console.error("Error getting poll responses:", error);
          });
        
        // Assemble poll card
        pollCard.appendChild(pollQuestion);
        pollCard.appendChild(pollOptions);
        
        // Add to container
        pollsContainer.appendChild(pollCard);
      });
      
      hideLoading();
    }, error => {
      console.error("Error loading polls:", error);
      document.getElementById('pollsContainer').innerHTML = `
        <div class="error-message">Error loading polls: ${error.message}</div>
      `;
      hideLoading();
    });
  
  return unsubscribe;
}

// --- Projects & Clubs with Real-time Updates ---
function loadProjectsRealTime() {
  showLoading();
  
  // Use onSnapshot for real-time updates
  const unsubscribe = db.collection("projects")
    .orderBy("createdAt", "desc")
    .onSnapshot(snapshot => {
      const grid = document.getElementById('projectsGrid');
      grid.innerHTML = "";
      
      if (snapshot.empty) {
        // Fallback to static projects if no data in Firestore
        renderStaticProjects();
        hideLoading();
        return;
      }
      
      snapshot.forEach(doc => {
        const p = doc.data();
        const div = document.createElement('div');
        div.className = "project-card";
        div.dataset.id = doc.id;
        div.innerHTML = `
          <div class="project-title">${p.title || ""}</div>
          <div class="project-team">${p.team || ""}</div>
          <div class="project-status">${p.status || ""}</div>
        `;
        grid.appendChild(div);
      });
      
      hideLoading();
    }, error => {
      console.error("Error loading projects:", error);
      // Fallback to static projects on error
      renderStaticProjects();
      hideLoading();
    });
  
  // Return unsubscribe function for cleanup
  return unsubscribe;
}

// Fallback static projects
function renderStaticProjects() {
  const projects = [
    { title: "Mars Rover Bridge", team: "Team Ares", status: "Ongoing" },
    { title: "Hydroponics Dome", team: "GreenMartians", status: "Completed" },
    { title: "Martian Habitat AI", team: "RedBrains", status: "Ongoing" },
    { title: "Mars Radio Club", team: "ComMartians", status: "Recruiting" }
  ];
  
  const grid = document.getElementById('projectsGrid');
  grid.innerHTML = "";
  projects.forEach(p => {
    const div = document.createElement('div');
    div.className = "project-card";
    div.innerHTML = `
      <div class="project-title">${p.title}</div>
      <div class="project-team">${p.team}</div>
      <div class="project-status">${p.status}</div>
    `;
    grid.appendChild(div);
  });
}

// --- Martian Daily Knowledge ---
function setupKnowledgeBubble() {
  const knowledgeFacts = [
    "Mars has a thin atmosphere composed mainly of carbon dioxide. The planet's surface features valleys, deserts, and polar ice caps, and it has two small moons: Phobos and Deimos.",
    "A day on Mars is 24.6 hours, slightly longer than Earth's. A year on Mars is 687 Earth days, as it's farther from the Sun and takes longer to complete its orbit.",
    "The highest mountain in our solar system is on Mars: Olympus Mons, a shield volcano standing 22km high and 600km in diameter.",
    "Mars has the largest dust storms in the solar system. They can last for months and cover the entire planet.",
    "The surface of Mars is rusty due to iron minerals in the soil oxidizing or rusting, giving the planet its distinctive red appearance."
  ];
  
  let currentFactIndex = 0;
  const knowledgeBubble = document.getElementById('knowledgeBubble');
  
  // Set initial fact
  knowledgeBubble.textContent = knowledgeFacts[currentFactIndex];
  
  // Rotate facts every 30 seconds
  setInterval(() => {
    currentFactIndex = (currentFactIndex + 1) % knowledgeFacts.length;
    
    // Fade out
    knowledgeBubble.style.opacity = 0;
    
    // Change text and fade in after a short delay
    setTimeout(() => {
      knowledgeBubble.textContent = knowledgeFacts[currentFactIndex];
      knowledgeBubble.style.opacity = 1;
    }, 500);
  }, 30000);
  
  // Add transition for smooth fade
  knowledgeBubble.style.transition = 'opacity 0.5s ease';
}

// --- Create twinkling stars effect ---
function createTwinklingStars() {
  const stars = document.querySelector('.stars');
  const starsCount = 200;
  
  for (let i = 0; i < starsCount; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    star.style.top = `${Math.random() * 100}%`;
    star.style.left = `${Math.random() * 100}%`;
    star.style.animationDelay = `${Math.random() * 10}s`;
    star.style.animationDuration = `${1 + Math.random() * 2}s`;
    stars.appendChild(star);
  }
}

// Add event listeners for the View All buttons
document.addEventListener('DOMContentLoaded', function() {
  const galleryViewAllBtn = document.querySelector('.gallery-section .view-all-btn');
  if (galleryViewAllBtn) {
    galleryViewAllBtn.addEventListener('click', function() {
      window.location.href = "gallery.html";
    });
  }

  const resourcesViewAllBtn = document.querySelector('.resources-section .view-all-btn');
  if (resourcesViewAllBtn) {
    resourcesViewAllBtn.addEventListener('click', function() {
      window.location.href = "resources.html";
    });
  }
});

// Make sure loading overlay is hidden when page is fully loaded
window.addEventListener('load', function() {
  // Hide loading after a short delay to ensure all content is rendered
  setTimeout(() => {
    hideLoading(true);
  }, 1000);
});

// Add safety timeout to hide loading overlay after 15 seconds no matter what
setTimeout(() => {
  hideLoading(true);
}, 15000);

// Helper function to show alerts
function showAlert(message, color = "#ff4040") {
  const alertElement = document.createElement('div');
  alertElement.className = 'alert-message';
  alertElement.textContent = message;
  alertElement.style.backgroundColor = color;
  
  document.body.appendChild(alertElement);
  
  setTimeout(() => {
    alertElement.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    alertElement.classList.remove('show');
    setTimeout(() => {
      alertElement.remove();
    }, 300);
  }, 3000);
}
