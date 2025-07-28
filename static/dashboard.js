document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const quickSplitBtn = document.getElementById('quickSplitBtn');
    const createTripBtn = document.getElementById('createTripBtn');
    const createTripModal = document.getElementById('createTripModal');
    const closeCreateTripModal = document.getElementById('closeCreateTripModal');
    const cancelCreateTrip = document.getElementById('cancelCreateTrip');
    const createTripForm = document.getElementById('createTripForm');
    const tripsGrid = document.getElementById('tripsGrid');
    const noTripsMessage = document.getElementById('noTripsMessage');

    // Form elements
    const tripNameInput = document.getElementById('tripName');
    const tripDescriptionInput = document.getElementById('tripDescription');
    const memberNameInput = document.getElementById('memberName');
    const addMemberBtn = document.getElementById('addMemberBtn');
    const membersList = document.getElementById('membersList');

    // Data storage
    let trips = JSON.parse(localStorage.getItem('trips') || '[]');
    let currentMembers = [];

    // Initialize dashboard
    function initDashboard() {
        displayTrips();
    }

    // Display trips
    function displayTrips() {
        if (trips.length === 0) {
            tripsGrid.innerHTML = noTripsMessage.outerHTML;
            return;
        }

        tripsGrid.innerHTML = '';

        trips.forEach(trip => {
            const tripCard = createTripCard(trip);
            tripsGrid.appendChild(tripCard);
        });
    }

    // Create trip card element
    function createTripCard(trip) {
        const card = document.createElement('div');
        card.className = 'trip-card';

        const balance = calculateTripBalance(trip);

        card.innerHTML = `
            <div class="trip-header">
                <h3 class="trip-name">${trip.name}</h3>
                <button class="delete-trip-btn" onclick="deleteTrip('${trip.id}', event)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3,6 5,6 21,6"></polyline>
                        <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                    </svg>
                </button>
            </div>
            <div class="trip-members">
                ${trip.members.slice(0, 3).map(member => 
                    `<span class="member-tag">${member}</span>`
                ).join('')}
                ${trip.members.length > 3 ? `<span class="member-tag">+${trip.members.length - 3}</span>` : ''}
            </div>
            <div class="trip-summary">
                <span>${trip.expenses ? trip.expenses.length : 0} expenses</span>
                <span class="trip-balance ${balance >= 0 ? 'balance-positive' : 'balance-negative'}">
                    ${balance >= 0 ? '+' : ''}$${balance.toFixed(2)}
                </span>
            </div>
        `;

        // Add click event for opening trip (but not when clicking delete button)
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-trip-btn')) {
                openTrip(trip.id);
            }
        });

        return card;
    }

    // Calculate trip balance for current user (improved with detailed split)
    function calculateTripBalance(trip) {
        if (!trip.expenses) return 0;
        
        // Assume current user is the first member
        const currentUser = trip.members[0];
        let userPaid = 0;
        let userShare = 0;
        
        trip.expenses.forEach(expense => {
            if (expense.paidBy === currentUser) {
                userPaid += expense.amount;
            }
            
            // Use detailed split if available, otherwise fall back to equal split
            if (expense.detailedSplit && expense.detailedSplit.personShares) {
                userShare += expense.detailedSplit.personShares[currentUser] || 0;
            } else {
                // Fallback to equal split for older expenses
                const shareAmount = expense.amount / expense.splitBetween.length;
                if (expense.splitBetween.includes(currentUser)) {
                    userShare += shareAmount;
                }
            }
        });
        
        return userPaid - userShare;
    }

    // Format date
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
        });
    }

    // Event Listeners
    quickSplitBtn.addEventListener('click', () => {
        window.location.href = '/expense';
    });

    createTripBtn.addEventListener('click', () => {
        createTripModal.style.display = 'flex';
    });

    closeCreateTripModal.addEventListener('click', () => {
        createTripModal.style.display = 'none';
        resetCreateTripForm();
    });

    cancelCreateTrip.addEventListener('click', () => {
        createTripModal.style.display = 'none';
        resetCreateTripForm();
    });

    // Close modal when clicking outside
    createTripModal.addEventListener('click', (e) => {
        if (e.target === createTripModal) {
            createTripModal.style.display = 'none';
            resetCreateTripForm();
        }
    });

    // Add member
    addMemberBtn.addEventListener('click', () => {
        const memberName = memberNameInput.value.trim();
        if (memberName && !currentMembers.includes(memberName)) {
            currentMembers.push(memberName);
            updateMembersList();
            memberNameInput.value = '';
        }
    });

    // Handle Enter key in member input
    memberNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addMemberBtn.click();
        }
    });

    // Create trip form submission
    createTripForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const tripData = {
            id: Date.now().toString(),
            name: tripNameInput.value.trim(),
            description: tripDescriptionInput.value.trim(),
            members: [...currentMembers],
            expenses: [],
            createdAt: new Date().toISOString()
        };

        trips.unshift(tripData); // Add to beginning of array
        localStorage.setItem('trips', JSON.stringify(trips));

        // Update display
        displayTrips();

        // Close modal and reset form
        createTripModal.style.display = 'none';
        resetCreateTripForm();
    });

    // Update members list display
    function updateMembersList() {
        membersList.innerHTML = '';
        currentMembers.forEach(member => {
            const memberItem = document.createElement('div');
            memberItem.className = 'member-item';
            memberItem.innerHTML = `
                ${member}
                <button onclick="removeMember('${member}')">&times;</button>
            `;
            membersList.appendChild(memberItem);
        });
    }

    // Remove member (global function for onclick)
    window.removeMember = function(memberName) {
        currentMembers = currentMembers.filter(member => member !== memberName);
        updateMembersList();
    };

    // Delete trip (global function for onclick)
    window.deleteTrip = function(tripId, event) {
        event.stopPropagation();
        
        if (confirm('Are you sure you want to delete this trip? This action cannot be undone.')) {
            trips = trips.filter(trip => trip.id !== tripId);
            localStorage.setItem('trips', JSON.stringify(trips));
            displayTrips();
        }
    };

    // Reset create trip form
    function resetCreateTripForm() {
        createTripForm.reset();
        currentMembers = [];
        updateMembersList();
    }

    // Open trip
    function openTrip(tripId) {
        window.location.href = `/trip/${tripId}`;
    }

    // Initialize dashboard
    initDashboard();
}); 