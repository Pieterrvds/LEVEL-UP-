
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

// Open & Close Modal
const modal = document.getElementById("bmiModal");
const openModalBtn = document.getElementById("openModal");
const closeModal = document.querySelector(".close");

openModalBtn.onclick = () => { modal.style.display = "flex"; };
closeModal.onclick = () => { modal.style.display = "none"; };
window.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };

// BMI, BMR & Meal Plan Calculation
document.getElementById("calculate").onclick = function () {
    const weight = parseFloat(document.getElementById("weight").value);
    const height = parseFloat(document.getElementById("height").value);
    const age = parseInt(document.getElementById("age").value);
    const gender = document.getElementById("gender").value;
    const activity = parseFloat(document.getElementById("activity").value);
    const goal = document.getElementById("goal").value;

    if (!weight || !height || !age) {
        alert("Please fill out all fields.");
        return;
    }

    // BMI Calculation
    const bmi = (weight / ((height / 100) ** 2)).toFixed(1);

    // BMR Calculation (Mifflin-St Jeor Equation)
    let bmr = (gender === "male")
        ? 88.36 + (13.4 * weight) + (4.8 * height) - (5.7 * age)
        : 447.6 + (9.2 * weight) + (3.1 * height) - (4.3 * age);
    
    bmr = bmr.toFixed(1);

    // Estimated Daily Calorie Burn
    let dailyCalories = bmr * activity;

    // Adjust Calories Based on Goal
    if (goal === "lose") {
        dailyCalories *= 0.8;  // 20% deficit
    } else if (goal === "gain") {
        dailyCalories *= 1.15; // 15% surplus
    }
    dailyCalories = dailyCalories.toFixed(1);

    // Generate a meal plan based on the goal
    const mealPlan = generateMealPlan(goal);

    // Display Results inside the pop-up
    document.getElementById("results").innerHTML = `
        <p><strong>BMI:</strong> ${bmi}</p>
        <p><strong>BMR:</strong> ${bmr} kcal/day</p>
        <p><strong>Estimated Daily Calories:</strong> ${dailyCalories} kcal/day</p>
        <h3>Suggested Meal Plan 🍽️</h3>
        ${mealPlan}
    `;
};

// Function to Generate Meal Plan
function generateMealPlan(goal) {
    const meals = {
        lose: ["Scrambled Egg Whites & Avocado 🥑", "Grilled Chicken Salad 🥗", "Salmon & Quinoa 🐟", "Protein Shake 🥤"],
        maintain: ["Oatmeal with Peanut Butter 🥜", "Brown Rice & Tuna 🍚", "Greek Yogurt with Nuts 🍓", "Grilled Chicken Wrap 🌯"],
        gain: ["Steak with Mashed Potatoes 🥩", "Salmon with Pasta 🍝", "Protein Shake with Oats 🥤", "Egg Omelette with Toast 🍳"]
    };

    let mealOptions = meals[goal];
    return `
        <p>🥣 <strong>Breakfast:</strong> ${mealOptions[0]}</p>
        <p>🥗 <strong>Lunch:</strong> ${mealOptions[1]}</p>
        <p>🍎 <strong>Snack:</strong> ${mealOptions[2]}</p>
        <p>🍽️ <strong>Dinner:</strong> ${mealOptions[3]}</p>
    `;
}


    
