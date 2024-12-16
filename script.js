
/* General Styles */
body {
  font-family: 'Press Start 2P', cursive;
  background-color: #000;
  color: #fff;
  margin: 0;
  padding: 0;
}

h1, h2, h3 {
  text-align: center;
}

.section {
  padding: 50px 20px;
  text-align: center;
}


/* Hero Section */
.hero {
  background-color: #000;
  text-align: center;
  padding: 50px 20px;
}

.header-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.header-image {
  width: 300px;
  height: auto;
  border-radius: 10px;
}

.title-container {
  text-align: center;
}

.title {
  font-size: 3rem;
  margin-bottom: 20px;
}

.tagline {
  font-size: 1.5rem;
  margin-bottom: 30px;
}

/* Keyframes for bounce animation */
@keyframes bounce {
  0%, 100% {
    transform: translateY(0); /* Start and end at the same position */
  }
  50% {
    transform: translateY(-10px); /* Move up slightly */
  }
}

/* Add the animation to the CTA button */
.cta-button {
  font-size: 1rem;
  animation: bounce 2s infinite; /* Apply bounce animation */
  display: inline-block;
  transition: 0.3s;
}

.cta-button:hover {
  animation: none; /* Stop bouncing on hover */
  color: #fff;
  background: #000;
  border-color: #000;
}

/* About Section */
.about-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  text-align: left;
  max-width: 900px; /* Adjusting max-width for the whole content */
  margin: 0 auto;
}

.trainer-image {
  border-radius: 50%;
  width: 200px;
  height: 200px;
}

/* Read More Button */
.calendarbutton {
  background: #fff;
  color: #000;
  padding: 10px 20px;
  border: 2px solid #fff;
  border-radius: 5px;
  cursor: pointer;
  transition: 0.3s;
  margin-top: 20px;
  max-width: 200px;
}

.calendarbutton:hover {
  background: #000;
  color: #fff;
  border-color: #000;    /*box-shadow: 6px 6px 6px rgba(199, 196, 196, 0.86);*/
}

/* The Team Section */
.team {
  background-color: #000;
  color: #fff;
  padding: 50px 20px;
}

.team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
}

.team-member:hover {
  cursor:pointer;
  color: #000;
  background-color: rgb(255, 255, 255); 
  transform: scale(1.05);

  }

  .team-member:hover::after {
    content: "Double-click to get to know this trainer!";
    position: absolute;
    bottom: -20px;
    left: 50%;
    transform: translateX(-50%);
    background: #fff;
    color: #000;
    padding: 5px 10px;
    border-radius: 5px;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  
  
.team-member {
  display: flex;
  align-items: center;
  gap: 20px;
  border: 2px solid #fff;
  padding: 20px;
  border-radius: 10px;
  transition: background-color 0.3s, color 0.3s, transform 0.3s;
  }

.team-photo {
  width: 150px;
  height: 150px;
  border-radius: 50%;
  object-fit: cover;
}

.team-info {
  text-align: left;
}

.team-info h3 {
  margin: 0 0 10px;
  font-size: 1.2rem;
}

.team-info p {
  margin: 0;
  font-size: 0.9rem;
}


/* Programs Section */

@keyframes bounce {
  0%, 100% {
      transform: translateY(0);
  }
  50% {
      transform: translateY(-10px);
  }
}

.programs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

.program-card {
  perspective: 1000px; /* Enable 3D perspective for the flip */
  animation: bounce 2s infinite;
  transition: transform 0.3s ease;
}

.program-card:hover {
  animation: none; /* Stop the bounce animation on hover */
  transform: scale(1.05); /* Add a slight zoom effect */
}

.card-inner {
  position: relative;
  width: 100%;
  height: 300px;
  transform-style: preserve-3d;
  transition: transform 0.8s;
}

.card-front,
.card-back {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  border: 2px solid #fff;
  border-radius: 10px;
  overflow: hidden;
}

.card-front {
  border: 2px solid #fff;
  align-items: center;
  cursor: pointer;
}

#card-front1{
  background: url('img/pulluptraining.jpg');
  background-size: cover;
  background-position: center; /* Center the image within the container */
  background-repeat: no-repeat; /* Prevent the image from repeating */
}

#overtext{
  z-index:1;
}

#card-front1::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5); /* Black overlay at 50% transparency */
  border-radius: 5px;
}

.card-back {
  transform: rotateY(180deg);
  background-color: #000;
  Text-align: center;
}

.card-front img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Flip Effect on Click */
.program-card.flipped .card-inner {
  transform: rotateY(180deg);
}

/* calender section*/
.calendar-section {
  background-color: #000; /* Black primary color */
  color: #fff; /* White secondary color */
  padding: 50px 20px;
  text-align: center;
  background: url('img/groenklimop.png'), url('img/groenklimop.png'), url('img/groenklimop.png');
  background-size: contain;
  background-position: left,center,right;
  background-repeat: no-repeat; /* Prevent the image from repeating */
  
}

.calendar-section h2 {
  font-size: 2em;
  margin-bottom: 20px;
}


.calendar-container iframe {
  width: 100%;
  max-width: 1000px;
  height: 600px;
  box-shadow: 0 4px 10px rgba(255, 255, 255, 0.2);
  font-family: 'Press Start 2P', sans-serif; /* Example font */
  border-radius: 50px;
}

/* Contact Section */

#contact{
  background: url('img/groenklimop.png'), url('img/groenklimop.png'), url('img/groenklimop.png');
  background-size: contain;
  background-position: left,center,right;
  background-repeat: no-repeat; /* Prevent the image from repeating */
}


.contact-form {
  display: flex;
  flex-direction: column; /* Stack items vertically */
  gap: 10px; /* Add space between items */
  max-width: 50%;
  margin: 0 auto; /* Center the form on the page */
  align-items: center; /* center the items on the page*/
}

select {
  width: 50%; /* Full width like other inputs */
  font-family: 'Press Start 2P', cursive;
  padding: 10px;
  border: 2px solid #fff;
  border-radius: 5px;
  background: #000;
  color: #fff;
  box-sizing: border-box; /* Include padding in width */
  cursor: pointer;
}

select option {
  background: #000;
  color: #fff;
}


input, textarea, button {
  width: 100%; /* Ensure inputs stretch to the container's width */
  font-family: 'Press Start 2P', cursive;
  padding: 10px;
  border: 2px solid #fff;
  border-radius: 5px;
  background: #000;
  color:#fff;
  box-sizing: border-box; /* Include padding in width calculations */
}

textarea {
  resize: none; /* Disable resizing for consistent design */
  height: 100px;
}

.social-icons  {
  padding:10px;
}

#social-ions {
  border-radius: 20px;
}

/* Footer */
.footer {
  text-align: center;
  padding: 10px 0;
  background: #000;
  border-top: 2px solid #fff;
}


a, button {
  text-decoration: none;
  color: #000;
  background: #fff;
  padding: 10px 20px;
  border: 2px solid #fff;
  border-radius: 5px;
  display: inline-block;
  transition: 0.3s;
  cursor: pointer;
}

a:hover, button:hover {
  color: #fff;
  background: #000;
  border-color: #000;
}



/* Mobile-Friendly Adjustments */
@media (max-width: 768px) {
  /* Section Headings */
  h2 {
    font-size: 1.5rem;
  }

  /* Program Section */
  .program-card {
    flex-direction: column;
    text-align: center;
    margin: 20px 0;
  }

  /* Calendar Section */
  .calendar-container iframe {
    width: 100%;
    height: 400px; /* Reduce height on mobile */
  }

  /* Team Section */
  .team-member {
    flex-direction: column; /* Stack image and text */
    align-items: center;
    text-align: center;
  }

  .team-member img {
    width: 80%; /* Reduce image size */
    margin-bottom: 10px;
  }

  /* Contact Section */
  #contact-form input, #contact-form textarea, #contact-form select, #contact-form button {
    width: 100%; /* Full-width form elements */
    margin-bottom: 15px;
  }

  /* Navigation (Optional for Mobile Navigation Menu) */
  nav ul {
    flex-direction: column;
    gap: 10px;
  }

  nav ul li {
    text-align: center;
  }
}
