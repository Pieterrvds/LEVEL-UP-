
// toggle hamburger menu 
function toggleMenu() {
    const menu = document.getElementById("mobileMenu");
    menu.classList.toggle("open"); // Toggle open/close
  }
  
  // Close menu when clicking a link
  document.querySelectorAll(".mobile-menu a").forEach(link => {
    link.addEventListener("click", () => {
      document.getElementById("mobileMenu").classList.remove("open");
    });
  });
  
  // Close menu when clicking outside
  document.addEventListener("click", (event) => {
    const menu = document.getElementById("mobileMenu");
    const menuButton = document.querySelector(".hamburger-menu");
  
    if (!menu.contains(event.target) && !menuButton.contains(event.target)) {
      menu.classList.remove("open"); // Close the menu
    }
  });
  
  
  // Add hover effect to the header images
  const headerImages = document.querySelectorAll('.header-image');
  
  headerImages.forEach(image => {
    image.addEventListener('mouseover', () => {
      image.style.transform = 'scale(1.1)';
      image.style.transition = 'transform 0.3s';
    });
  
    image.addEventListener('mouseout', () => {
      image.style.transform = 'scale(1)';
    });
  });
  
  // Select all program cards
  const programCards = document.querySelectorAll('.program-card');
  
      programCards.forEach(card => {
      // Add click event listener to toggle the "flipped" class
      card.addEventListener('click', () => {
        card.classList.toggle('flipped');
      });
    });
  
    // Select all team members
    const teamMembers = document.querySelectorAll('.team-member');
  
    // Add a double-click event to each team member
    teamMembers.forEach(member => {
      member.addEventListener('dblclick', () => {
        const url = member.getAttribute('data-url'); // Get the URL from the data attribute
        if (url) {
          window.open(url, '_blank'); // Open the URL in a new tab
        }
        if (!url) {
          alert('Link to this trainer comming soon ;)');
        }
  
      });
    });
  
  
