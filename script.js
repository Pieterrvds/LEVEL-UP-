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


  // Gallery Popup Logic
  const popupOverlay = document.getElementById('popup-overlay');
  const popupImage = document.getElementById('popup-image');
  const popupVideo = document.getElementById('popup-video');
  const closePopup = document.querySelector('.close-popup');

  // Event Listener for Gallery Items
  document.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', (event) => {
      const img = item.querySelector('img');
      const video = item.querySelector('video');

      // Show Image or Video in Popup
      if (img) {
        popupImage.src = img.src;
        popupImage.style.display = 'block';
        popupVideo.style.display = 'none';
      } else if (video) {
        popupVideo.src = video.querySelector('source').src;
        popupVideo.style.display = 'block';
        popupImage.style.display = 'none';
      }

      // Display the Popup Overlay
      popupOverlay.style.display = 'flex';
    });
  });

  // Close Popup Logic
  closePopup.addEventListener('click', () => {
    popupOverlay.style.display = 'none';
    popupImage.src = '';
    popupVideo.src = '';
  });

  // Close Popup When Clicking Outside
  popupOverlay.addEventListener('click', (event) => {
    if (event.target === popupOverlay) {
      popupOverlay.style.display = 'none';
      popupImage.src = '';
      popupVideo.src = '';
    }
  });




//add functionality like adding items to a cart Manage the cart and display the modal
const cart = [];

  // Add to Cart Functionality
  document.querySelectorAll('.merch-item button').forEach((button, index) => {
    button.addEventListener('click', () => {
      const itemName = button.parentElement.querySelector('h3').textContent;
      const itemPrice = parseFloat(button.parentElement.querySelector('p').textContent.slice(1));

      cart.push({ name: itemName, price: itemPrice });
      alert(`${itemName} has been added to your cart!`);
    });
  });

  // Modal Functionality
  const modal = document.getElementById('cart-modal');
  const viewCartBtn = document.getElementById('view-cart-btn');
  const closeBtn = document.querySelector('.close-btn');
  const cartItemsContainer = document.getElementById('cart-items');

  // Open Modal
  viewCartBtn.addEventListener('click', () => {
    cartItemsContainer.innerHTML = ''; // Clear previous items
    if (cart.length === 0) {
      cartItemsContainer.innerHTML = '<p>Your cart is empty.</p>';
    } else {
      cart.forEach(item => {
        const itemElement = document.createElement('p');
        itemElement.textContent = `${item.name} - $${item.price.toFixed(2)}`;
        cartItemsContainer.appendChild(itemElement);
      });
    }
    modal.style.display = 'flex';

    // Initialize PayPal Buttons
    renderPayPalButtons();
  });

  // Close Modal
  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Close Modal on Outside Click
  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  // Render PayPal Buttons
  function renderPayPalButtons() {
    const paypalContainer = document.getElementById('paypal-button-container');
    paypalContainer.innerHTML = ''; // Clear existing buttons

    paypal.Buttons({
      createOrder: (data, actions) => {
        const total = cart.reduce((sum, item) => sum + item.price, 0).toFixed(2);

        return actions.order.create({
          purchase_units: [
            {
              amount: {
                value: total,
              },
              description: "Level-Up Merch Cart",
            },
          ],
        });
      },
      onApprove: (data, actions) => {
        return actions.order.capture().then((details) => {
          // Gather cart and buyer information
          const buyerName = details.payer.name.given_name + " " + details.payer.name.surname;
          const buyerEmail = details.payer.email_address;
          const total = cart.reduce((sum, item) => sum + item.price, 0).toFixed(2);
          const cartDetails = cart
            .map(item => `${item.name} - $${item.price.toFixed(2)}`)
            .join('\n');
      
          // Prepare email data for FormSubmit
          const formData = new FormData();
          formData.append("to", "PieterV-D-S@hotmail.com, arnold.borms@gmail.com");
          formData.append("subject", "New Payment Received");
          formData.append("message", `A payment has been received with the following details:
          
          Buyer Name: ${buyerName}
          Buyer Email: ${buyerEmail}
          Total Price: $${total}
          Items:
          ${cartDetails}`);
      
          // Send email using FormSubmit
          fetch("https://formsubmit.co/PieterV-D-S@hotmail.com", {
            method: "POST",
            body: formData,
          })
            .then(response => {
              if (response.ok) {
                console.log("Email sent successfully!");
              } else {
                console.error("Failed to send email.");
              }
            })
            .catch(error => console.error("Error sending email:", error));
      
          // Thank-you alert and clear cart
          alert(`Thank you for your purchase, ${buyerName}!`);
          cart.length = 0; // Clear the cart
          modal.style.display = "none"; // Close the modal
        });
      },
      onError: (err) => {
        console.error('PayPal Checkout Error:', err);
        alert('Something went wrong during the checkout process. Please try again.');
      },
    }).render(paypalContainer);
  }
