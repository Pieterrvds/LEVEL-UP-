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
// Select all program elements and the image container
const programs = document.querySelectorAll('.program');
const programImageContainer = document.getElementById('program-image-container');
const programImage = document.getElementById('program-image');

// Add click event listeners to each program
programs.forEach(program => {
  program.addEventListener('click', () => {
    // Get the image URL from the data-image attribute
    const imageUrl = program.getAttribute('data-image');
    
    // Set the image src and display the image container
    programImage.src = imageUrl;
    programImage.alt = program.querySelector('h3').textContent;
    programImageContainer.style.display = 'block';
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
