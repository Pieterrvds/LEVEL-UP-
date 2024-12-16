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

    // Add product to the cart
    cart.push({ product, price });
    updateCart();

    // Show notification
    showNotification(`${product} added to cart!`);
  });
});

// Update the updateCart function to call updateCartCount
function updateCart() {
  cartItems.innerHTML = ""; // Clear current cart display
  let total = 0;

  // Populate cart items
  cart.forEach((item, index) => {
    total += item.price;

    // Create cart item element
    const li = document.createElement("li");
    li.textContent = `${item.product} - $${item.price}`;

    // Add Remove Button
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.classList.add("remove-item");
    removeBtn.addEventListener("click", () => {
      removeCartItem(index); // Remove item on button click
    });

    li.appendChild(removeBtn);
    cartItems.appendChild(li);
  });

  // Update total
  cartTotal.textContent = `Total: $${total.toFixed(2)}`;

    // Update cart count in the header
    updateCartCount();

  // PayPal Button
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

  paypal.Buttons({
    createOrder: function () {
      return {
        purchase_units: [
          {
            amount: {
              value: total.toFixed(2),
            },
          },
        ],
      };
    },
    onApprove: function (data, actions) {
      return actions.order.capture().then(function (details) {
        // Extract buyer information
        const buyerName = details.payer.name.given_name;
        const buyerEmail = details.payer.email_address;

        // Prepare purchase details excluding total price
        const purchaseDetails = cart
          .map((item) => `Product: ${item.product}`)
          .join("\n");

        // Send confirmation email to buyer
        sendConfirmationEmail(buyerName, buyerEmail, purchaseDetails);

        // Send confirmation email to you
        sendConfirmationEmail("Admin", "PieterV-D-S@hotmail.com", purchaseDetails);

        // Notify the user
        alert("Payment successful! Confirmation email sent.");
        cart = []; // Clear cart after purchase
        updateCart();
      });
    },
  }).render("#paypal-button-container");
}

// Function to send confirmation email
function sendConfirmationEmail(name, email, purchaseDetails) {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("email", email);
  formData.append(
    "message",
    `Thank you for your purchase!\n\n${purchaseDetails}\n\nBest regards,\nLEVEL-UP Team`
  );

  // Send email using FormSubmit
  fetch("https://formsubmit.co/ajax/PieterV-D-S@hotmail.com", {
    method: "POST",
    body: formData,
  })
    .then((response) => response.json())
    .then((data) => {
      console.log("Email sent:", data);
    })
    .catch((error) => {
      console.error("Error sending email:", error);
    });
}

// Close Cart
document.querySelector(".close-cart").addEventListener("click", () => {
  cartOverlay.classList.add("hidden");
});
