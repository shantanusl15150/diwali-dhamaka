// Everything you are likely to tweak lives here.
window.PARTY_CONFIG = {
  production: "SHA-adi",
  eventStart: "2026-11-01T18:00:00+05:30",
  dateLabel: "Sun, 1 Nov 2026",
  timeLabel: "6 PM onwards",

  venue: {
    name: "Ghar Pe! (Our Home)",
    address: "Address will be shared on WhatsApp",
    mapUrl: "",
  },

  // Google Apps Script web-app URL (see apps-script/Code.gs). Empty = demo mode, nothing is sent.
  rsvpEndpoint: "https://script.google.com/macros/s/AKfycbzMopOHnmAy6Rd6EWGD5rg0ZakQChZdFZTrXGKqP1Ahti8XdQhOob0GdvX5xuCyBXk8/exec",

  // Optional backup channel, digits only with country code, e.g. "919876543210".
  whatsappNumber: "917506662251",

  // Wheel options per RSVP choice. Replace with the final food list.
  wheels: {
    yes: [
      "Kaju Katli",
      "Samosa",
      "Dhokla",
      "Gulab Jamun",
      "Chips & Dips",
      "Paneer Tikka",
      "Soft Drinks",
      "Namkeen Mix",
    ],
    plusOne: [
      "Pav Bhaji",
      "Chole Bhature",
      "Biryani",
      "Pizza Party",
      "Dessert Platter",
      "Chaat Counter",
    ],
    no: [
      "Send a box of mithai",
      "Owe us a dance",
      "Sing one song on video call",
      "Host the next party",
      "Send Diwali selfie in ethnic",
      "Buy us chai next time",
    ],
  },

  // Party teams. Guests are balanced across these when they RSVP.
  teams: [
    { name: "Team Mogambo", emoji: "😈", color: "#d4505f" },
    { name: "Team Basanti", emoji: "🐎", color: "#e0902f" },
    { name: "Team Munna Bhai", emoji: "🩺", color: "#3aa892" },
    { name: "Team Poo", emoji: "💅", color: "#9b72cf" },
  ],

  // Party-fuel choices (no alcohol). Shown for the guest and their +1.
  drinks: [
    { value: "Masala Chai", emoji: "☕", tag: "Tapri mode" },
    { value: "Thandai", emoji: "🥛", tag: "Shahi mode" },
    { value: "Cold Coffee", emoji: "🧋", tag: "Café mode" },
  ],

  // Secret missions are NOT here: this file is public. Add them in the "Missions" tab of the
  // Google Sheet; they're assigned on RSVP and sent to guests from party.html host mode.
  // WhatsApp message used by the "Send mission" button. {name}, {mission}, {team}, {seat} are filled in.
  missionMessage:
    "🪔 *Diwali Dhamaka · Top Secret*\n\nNamaste {name}! You're confirmed for 1 Nov, seat #{seat}, {team}.\n\nYour secret mission:\n\n*{mission}*\n\nTell no one. Trust no one. 🤫",

  // One-tap scoring buttons in party.html host mode.
  partyScoring: [
    { label: "Antakshari win", points: 50 },
    { label: "Dumb Charades", points: 30 },
    { label: "Best Dressed", points: 40 },
    { label: "Secret Mission", points: 25 },
    { label: "Dance-off", points: 30 },
    { label: "Dress code violation", points: -20 },
  ],

  // Public invite URL used in the +1 WhatsApp share.
  inviteUrl: "https://shantanusl15150.github.io/diwali-dhamaka/",
  // WhatsApp text when sharing the invite with a +1. {from}, {to}, {url} are filled in.
  shareInviteMessage:
    "🪔 *Diwali Dhamaka*\n\n{from} has cast you as their +1 for 1 Nov! Open the invite, enjoy the film & save your ticket:\n\n{url}\n\nTraditional attire compulsory ✨",

  // Audition quiz (10 Qs: 5 easy, 3 medium, 2 hard). Each correct answer = pointsPerAnswer for the guest's team.
  quiz: {
    pointsPerAnswer: 10,
    questions: [
      // Easy
      { q: "Complete the dialogue: \"Kitne aadmi ___?\"", options: ["hain", "the", "aaye", "bache"], answer: 1 },
      { q: "\"Mogambo khush hua\" is from which film?", options: ["Shaan", "Mr. India", "Karan Arjun", "Tridev"], answer: 1 },
      { q: "Who played Geet in Jab We Met?", options: ["Kareena Kapoor", "Priyanka Chopra", "Katrina Kaif", "Deepika Padukone"], answer: 0 },
      { q: "Diwali celebrates Lord Rama's return to which city?", options: ["Mathura", "Kashi", "Ayodhya", "Dwarka"], answer: 2 },
      { q: "Which goddess is worshipped on Diwali for wealth & prosperity?", options: ["Saraswati", "Lakshmi", "Durga", "Parvati"], answer: 1 },
      // Medium
      { q: "Which village does Gabbar Singh terrorise in Sholay?", options: ["Rampur", "Ramgarh", "Sitapur", "Chandanpur"], answer: 1 },
      { q: "\"Mere paas maa hai\" is from which film?", options: ["Deewaar", "Sholay", "Zanjeer", "Trishul"], answer: 0 },
      { q: "Who says \"Pushpa, I hate tears\"?", options: ["Amitabh Bachchan", "Dharmendra", "Rajesh Khanna", "Dev Anand"], answer: 2 },
      // Hard
      { q: "Which film has the song \"Gallan Goodiyaan\"?", options: ["ZNMD", "Kapoor & Sons", "Dil Dhadakne Do", "Bang Bang"], answer: 2 },
      { q: "In 3 Idiots, what is Rancho's real name?", options: ["Virus", "Chatur", "Phunsukh Wangdu", "Farhan Qureshi"], answer: 2 },
    ],
  },
};
