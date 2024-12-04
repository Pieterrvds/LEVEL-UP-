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
// Get references to form elements
const sendButton = document.getElementById('send-button');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const messageInput = document.getElementById('message');

// Add click event listener to the button
sendButton.addEventListener('click', () => {
  // Get form values
  const name = nameInput.value;
  const email = emailInput.value;
  const message = messageInput.value;

  // Validate the form
  if (!name || !email || !message) {
    alert('Please fill out all fields.');
    return;
  }

  // Construct the mailto link
  const mailtoLink = `mailto:PieterV-D-S@hotmail.com?subject=Message from ${encodeURIComponent(name)}&body=Name: ${encodeURIComponent(name)}%0AEmail: ${encodeURIComponent(email)}%0AMessage: ${encodeURIComponent(message)}`;

  // Open the mail client
  window.location.href = mailtoLink;
});

// Form submission event listener
document.querySelector('.contact-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const name = document.querySelector('input[type="text"]').value;
  const email = document.querySelector('input[type="email"]').value;
  const category = document.querySelector('#subject').value;
  const message = document.querySelector('textarea').value;

  if (!category) {
    alert('Please select a category!');
    return;
  }

  // Create email subject and body
  const mailtoLink = `mailto:your_email@example.com?subject=${encodeURIComponent(category)}&body=Name: ${encodeURIComponent(name)}%0AEmail: ${encodeURIComponent(email)}%0A%0A${encodeURIComponent(message)}`;

  // Open email client
  window.location.href = mailtoLink;

  alert('Thank you for reaching out! Your email is being prepared.');
});
