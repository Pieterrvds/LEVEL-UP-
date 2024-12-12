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

// Get the Read More button and the extra text
const readMoreButton = document.getElementById('read-more-button');
const extraText = document.getElementById('extra-text');

// Add event listener to toggle the visibility of extra text
readMoreButton.addEventListener('click', () => {
  // Toggle the extra text visibility
  if (extraText.style.display === 'none' || extraText.style.display === '') {
    extraText.style.display = 'block';
    readMoreButton.textContent = 'Read Less'; // Change button text
  } else {
    extraText.style.display = 'none';
    readMoreButton.textContent = 'Read More'; // Change button text back
  }
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


