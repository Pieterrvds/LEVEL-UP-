// Cart Management
const cartOverlay = document.querySelector("#cart");
const cartItems = document.querySelector("#cart-items");
const cartTotal = document.querySelector("#cart-total");
const cartIcon = document.querySelector("#cart-icon");
const cartCount = document.querySelector("#cart-count");
const notification = document.querySelector("#notification");
let cart = [];

// Function to show notification
function showNotification(message) {
  notification.textContent = message; // Set notification message
  notification.classList.add("show"); // Show the notification
  notification.classList.remove("hidden");

  // Hide the notification after 3 seconds
  setTimeout(() => {
    notification.classList.remove("show");
    notification.classList.add("hidden");
  }, 3000);
}

// Function to update the cart count in the header
function updateCartCount() {
  cartCount.textContent = cart.length; // Display the number of items in the cart
}

// Show the cart overlay when clicking the cart icon
cartIcon.addEventListener("click", () => {
  cartOverlay.classList.remove("hidden");
});

// Update the Add to Cart button logic
document.querySelectorAll(".add-to-cart").forEach(button => {
    button.addEventListener("click", () => {
      const product = button.getAttribute("data-product");
      const price = parseFloat(button.getAttribute("data-price"));
  
      // Get selected category (HIIT, CrossFit, Running)
      const subscriptionSelect = button.previousElementSibling;
      let selectedCategory = subscriptionSelect ? subscriptionSelect.value : "HIIT"; // Default to HIIT if none selected
  
      // Add product with selected category to the cart
      cart.push({ product, price, category: selectedCategory });
      updateCart();
  
      // Show notification
      showNotification(`${product} (${selectedCategory}) added to cart!`);
  
      // Add vibration effect to the cart icon
      cartIcon.classList.add("vibrate");
      setTimeout(() => cartIcon.classList.remove("vibrate"), 400);
    });
});
  
  // Update the updateCart function
  function updateCart() {
    cartItems.innerHTML = ""; // Clear current cart display
    let total = 0;
  
    // Populate cart items
    cart.forEach((item, index) => {
      total += item.price;
  
      // Create cart item element
      const li = document.createElement("li");
      li.textContent = `${item.product} (${item.category}) - $${item.price.toFixed(2)}`;
  
      // Add Remove Button
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Remove";
      removeBtn.classList.add("remove-item");
      removeBtn.addEventListener("click", () => removeCartItem(index));
  
      li.appendChild(removeBtn);
      cartItems.appendChild(li);
    });
  
    // Update total price
    cartTotal.textContent = `Total: $${total.toFixed(2)}`;
    updateCartCount();
    renderPayPalButton(total);
  }
  
  

// Remove item from cart
function removeCartItem(index) {
  cart.splice(index, 1); // Remove the item from cart array
  updateCart(); // Update the cart display
}

// Render PayPal Button
function renderPayPalButton(total) {
  // Clear the PayPal button container before re-rendering
  const paypalContainer = document.querySelector("#paypal-button-container");
  paypalContainer.innerHTML = ""; // Clear the PayPal container


  // Ensure the PayPal SDK script is loaded
  if (!window.paypal) {
     alert("PayPal SDK not loaded. Please check your client ID and connection.");
     return;
   }

  paypal.Buttons({
    // Creaye an order
    createOrder: function (data, actions) {
      return actions.order.create({
        purchase_units: [
          {
            amount: {
              value: total.toFixed(2),
            },
          },
        ],
      });
    },
    // On Successful aproval
    onApprove: function (data, actions) {
      return actions.order.capture().then(function (details) {
        // Extract buyer information
        const buyerName = details.payer.name.given_name;
        const buyerEmail = details.payer.email_address;

        // Prepare purchase details excluding total price
        const purchaseDetails = cart
        .map((item) => `Product: ${item.product} (Category: ${item.category})`)
        .join("\n");
      

        // Send confirmation email to buyer and CEO
        sendConfirmationEmail(buyerName, buyerEmail, purchaseDetails);

        // Send confirmation email to you
        // sendConfirmationEmail("Pieter", "PieterV-D-S@hotmail.com", purchaseDetails);

        // Notify the user and clear the cart
        alert("Payment successful! Confirmation email sent.");
        cart = []; // Clear cart after purchase
        updateCart();
      });
    },
    // Handle errors
    onError: function (err) {
      console.error("PayPal error:", err);
      alert("An error occurred during the payment process. Please try again.");
    },
  }).render("#paypal-button-container");
}

// Function to send confirmation email to client and to me the CEO ;)
function sendConfirmationEmail(name, email, purchaseDetails) {
  const formDataClient = new FormData();
  formDataClient.append("name", name);
  formDataClient.append("email", email);
  formDataClient.append("message", `Dear ${name},\n\nThank you for your purchase!\n\nHere are your purchased items:\n${purchaseDetails}\n\nKEEP THIS EMAIL AS A TICKET TO SHOW TO ONE OF OUR TRAINERS!\n\nBest regards,\nLEVEL-UP Team`);

  // Send email to the client
  fetch("https://formsubmit.co/ajax/" + email, { // Dynamically send to buyer
    method: "POST",
    body: formDataClient,
  })
    .then((response) => response.json())
    .then((data) => {
      console.log("Email sent to client:", data);
    })
    .catch((error) => {
      console.error("Error sending email to client:", error);
    });

  // Form data for CEO (Your email)
  const formDataAdmin = new FormData();
  formDataAdmin.append("name", "CEO of the biggest Grouptraining Business of planet earth PIETER VAN DEN SPIEGEL");
  formDataAdmin.append("email", "PieterV-D-S@hotmail.com");
  formDataAdmin.append("message", `New purchase received LESGOOOO!\n\nCustomer: ${name}\nEmail: ${email}\n\nPurchased items:\n${purchaseDetails}`);

  // Send email to CEO
  fetch("https://formsubmit.co/ajax/PieterV-D-S@hotmail.com", {
    method: "POST",
    body: formDataAdmin,
  })
    .then((response) => response.json())
    .then((data) => {
      console.log("Email sent to CEO:", data);
    })
    .catch((error) => {
      console.error("Error sending email to CEO:", error);
    });
}

// Close Cart
document.querySelector(".close-cart").addEventListener("click", () => {
  cartOverlay.classList.add("hidden");
});
