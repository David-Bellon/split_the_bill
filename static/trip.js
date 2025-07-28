document.addEventListener('DOMContentLoaded', () => {
    // Get trip ID from URL
    const tripId = window.location.pathname.split('/').pop();
    
    // DOM Elements
    const tripName = document.getElementById('tripName');
    const tripDescription = document.getElementById('tripDescription');
    const tripMembersList = document.getElementById('tripMembersList');
    const totalAmount = document.getElementById('totalAmount');
    const expenseCount = document.getElementById('expenseCount');
    const balancesPreview = document.getElementById('balancesPreview');
    const expensesList = document.getElementById('expensesList');
    const balancesSection = document.getElementById('balancesSection');
    const balancesList = document.getElementById('balancesList');
    
    // Modal elements
    const addExpenseBtn = document.getElementById('addExpenseBtn');
    const addDetailedExpenseBtn = document.getElementById('addDetailedExpenseBtn');
    const addExpenseModal = document.getElementById('addExpenseModal');
    const closeAddExpenseModal = document.getElementById('closeAddExpenseModal');
    const cancelAddExpense = document.getElementById('cancelAddExpense');
    const addExpenseForm = document.getElementById('addExpenseForm');
    const expenseNameInput = document.getElementById('expenseName');
    const expenseAmountInput = document.getElementById('expenseAmount');
    const expensePaidBySelect = document.getElementById('expensePaidBy');
    const splitOptions = document.getElementById('splitOptions');

    // Add member modal elements
    const addMemberBtn = document.getElementById('addMemberBtn');
    const addMemberModal = document.getElementById('addMemberModal');
    const closeAddMemberModal = document.getElementById('closeAddMemberModal');
    const cancelAddMember = document.getElementById('cancelAddMember');
    const addMemberForm = document.getElementById('addMemberForm');
    const newMemberNameInput = document.getElementById('newMemberName');

    // Data
    let currentTrip = null;
    let trips = JSON.parse(localStorage.getItem('trips') || '[]');
    let currentDebtMatrix = null; // Store the detailed debt matrix
    // Payments are stored in currentTrip.payments (array of {from, to, amount, date})

    // Initialize trip page
    function initTripPage() {
        loadTripData();
        setupEventListeners();
    }

    // Load trip data
    function loadTripData() {
        currentTrip = trips.find(trip => trip.id === tripId);
        
        if (!currentTrip) {
            // Trip not found, redirect to dashboard
            window.location.href = '/dashboard';
            return;
        }

        // Update page title and description
        tripName.textContent = currentTrip.name;
        tripDescription.textContent = currentTrip.description || 'No description provided';
        
        // Display trip data
        displayTripMembers();
        displayExpenses();
        updateTripSummary();
        calculateBalances();
        displayBalancesPreview();
    }

    // Display trip members
    function displayTripMembers() {
        tripMembersList.innerHTML = '';
        currentTrip.members.forEach(member => {
            const memberTag = document.createElement('span');
            memberTag.className = 'member-tag';
            memberTag.innerHTML = `
                ${member}
                <button class="remove-member-btn" onclick="removeMember('${member}')" title="Remove member">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            `;
            tripMembersList.appendChild(memberTag);
        });
    }

    // Display expenses
    function displayExpenses() {
        if (!currentTrip.expenses || currentTrip.expenses.length === 0) {
            expensesList.innerHTML = `
                <div class="no-expenses-message">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                    <h3>No expenses yet</h3>
                    <p>Add your first expense to start tracking</p>
                    <button id="addFirstExpenseBtn" class="primary-btn">Add First Expense</button>
                </div>
            `;
            
            // Re-attach event listener
            document.getElementById('addFirstExpenseBtn').addEventListener('click', () => {
                addExpenseModal.style.display = 'flex';
            });
            return;
        }

        expensesList.innerHTML = '';
        currentTrip.expenses.forEach(expense => {
            const expenseItem = createExpenseItem(expense);
            expensesList.appendChild(expenseItem);
        });
    }

    // Create expense item element
    function createExpenseItem(expense) {
        const item = document.createElement('div');
        item.className = 'expense-item';
        
        // Determine split text based on available data
        let splitText = '';
        if (expense.detailedSplit && expense.detailedSplit.personShares) {
            // Show detailed split information
            const shares = expense.detailedSplit.personShares;
            const shareDetails = Object.entries(shares)
                .filter(([person, share]) => share > 0)
                .map(([person, share]) => `${person}: $${share.toFixed(2)}`)
                .join(', ');
            splitText = `Detailed split: ${shareDetails}`;
        } else {
            // Fallback to simple split text
            splitText = expense.splitBetween.length === currentTrip.members.length 
                ? 'Split equally' 
                : `Split between ${expense.splitBetween.join(', ')}`;
        }

        item.innerHTML = `
            <div class="expense-info">
                <div class="expense-name">${expense.name}</div>
                <div class="expense-paid-by">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                        <line x1="1" y1="10" x2="23" y2="10"/>
                    </svg>
                    Paid by ${expense.paidBy}
                </div>
                <div class="expense-details">${splitText}</div>
                ${expense.detailedSplit ? createDetailedBreakdown(expense.detailedSplit) : ''}
            </div>
            <div class="expense-amount">
                <div class="expense-amount-value">$${expense.amount.toFixed(2)}</div>
                <div class="expense-amount-label">Total</div>
            </div>
        `;

        return item;
    }

    // Create detailed breakdown for expense items
    function createDetailedBreakdown(detailedSplit) {
        if (!detailedSplit.items || detailedSplit.items.length === 0) {
            return '';
        }

        const breakdownDiv = document.createElement('div');
        breakdownDiv.className = 'expense-breakdown';
        
        const itemsList = detailedSplit.items.map(item => {
            const assignments = Object.entries(item.assignments)
                .map(([person, data]) => `${person} (${data.quantity})`)
                .join(', ');
            
            return `
                <div class="breakdown-item">
                    <span class="item-name">${item.name}</span>
                    <span class="item-assignments">${assignments}</span>
                    <span class="item-total">$${item.totalPrice.toFixed(2)}</span>
                </div>
            `;
        }).join('');

        breakdownDiv.innerHTML = `
            <div class="breakdown-header">Item breakdown:</div>
            ${itemsList}
        `;

        return breakdownDiv.outerHTML;
    }

    // Update trip summary
    function updateTripSummary() {
        const total = currentTrip.expenses ? currentTrip.expenses.reduce((sum, expense) => sum + expense.amount, 0) : 0;
        const count = currentTrip.expenses ? currentTrip.expenses.length : 0;
        
        totalAmount.textContent = `$${total.toFixed(2)}`;
        expenseCount.textContent = `${count} expense${count !== 1 ? 's' : ''}`;
    }

    // Display balances preview
    function displayBalancesPreview() {
        if (!currentTrip.expenses || currentTrip.expenses.length === 0) {
            balancesPreview.innerHTML = '<p class="no-balances">No expenses yet</p>';
            return;
        }

        const balances = calculateAllBalances();
        balancesPreview.innerHTML = '';

        Object.entries(balances).forEach(([member, balance]) => {
            const balanceItem = document.createElement('div');
            balanceItem.className = 'balance-preview-item';
            
            const balanceClass = balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'even';
            const balanceText = balance > 0 ? 'is owed' : balance < 0 ? 'owes' : 'even';
            
            balanceItem.innerHTML = `
                <span class="balance-member">${member}</span>
                <span class="balance-amount ${balanceClass}">
                    ${balance > 0 ? '+' : ''}$${balance.toFixed(2)}
                </span>
            `;
            
            balancesPreview.appendChild(balanceItem);
        });
    }

    // Calculate all balances
    function calculateAllBalances() {
        let people_debt = [];
        const balances = {};
        currentTrip.members.forEach(member => {
            balances[member] = 0;
        });

        // Calculate balances using detailed split information
        currentTrip.expenses.forEach(expense => {
            const payer = expense.paidBy;
            
            balances[payer] += expense.amount; // Add what they paid

            let person_debt = {paidBy: payer, payed: []};
            
            // Use detailed split if available, otherwise fall back to equal split
            if (expense.detailedSplit && expense.detailedSplit.personShares) {
                Object.entries(expense.detailedSplit.personShares).forEach(([member, share]) => {
                    balances[member] -= share; // Subtract their actual share
                    person_debt.payed.push({member: member, amount: share});
                });
            } else {
                // Fallback to equal split for older expenses
                const shareAmount = expense.amount / expense.splitBetween.length;
                expense.splitBetween.forEach(member => {
                    balances[member] -= shareAmount;
                    person_debt.payed.push({member: member, amount: shareAmount});
                });
            }

            people_debt.push(person_debt);
        });

        console.log(currentTrip.payments);

        fetch('/calculate-debt', {
            method: 'POST',
            body: JSON.stringify({members: currentTrip.members, people_debt: people_debt, payments: currentTrip.payments || null})
        }).then(response => response.json()).then(data => {
            // Store the debt matrix and update the detailed balances UI
            currentDebtMatrix = data.debt;
            renderDetailedBalances();
        });

        return balances;
    }

    // Calculate and display balances
    function calculateBalances() {
        if (!currentTrip.expenses || currentTrip.expenses.length === 0) {
            balancesSection.style.display = 'none';
            return;
        }

        balancesSection.style.display = 'block';
        balancesList.innerHTML = '';

        // Only show the detailed breakdown now
        // The detailed breakdown will be rendered by renderDetailedBalances() after fetch
        calculateAllBalances();
    }

    // Render the detailed 'who owes whom' breakdown in the balances section
    function renderDetailedBalances() {
        if (!currentDebtMatrix) return;
        
        // Ensure payments array exists before using it
        if (!currentTrip.payments) currentTrip.payments = [];
        
        balancesList.innerHTML = '';

        // Fancy header
        const header = document.createElement('div');
        header.className = 'detailed-balances-header';
        header.style.fontWeight = '900';
        header.style.fontSize = '1.35em';
        header.style.margin = '0 0 1.2em 0';
        header.style.letterSpacing = '0.02em';
        header.style.color = '#2563eb';
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.innerHTML = `<svg style="margin-right:0.5em;" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 15s1.5-2 4-2 4 2 4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>Who owes whom`;
        balancesList.appendChild(header);

        let hasDebts = false;
        // Group by debtor (person who owes money)
        const members = Object.keys(currentDebtMatrix);
        members.forEach(debtor => {
            // Find all creditors this debtor owes money to
            const creditors = members.filter(creditor => {
                if (debtor === creditor) return false;
                let original = currentDebtMatrix[debtor][creditor] || 0;
                // Fix floating point issues by rounding to two decimals
                const remaining = Math.round((original - 0) * 100) / 100;
                return remaining > 0.009;
            });
            if (creditors.length > 0) {
                hasDebts = true;
                // Debtor heading
                const debtorHeader = document.createElement('div');
                debtorHeader.className = 'debtor-header';
                debtorHeader.innerHTML = `<svg class="debtor-header-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3182ce" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>${debtor} owes:`;
                balancesList.appendChild(debtorHeader);
                // List all creditors this debtor owes
                creditors.forEach(creditor => {
                    let original = currentDebtMatrix[debtor][creditor] || 0;
                    const amount = Math.round((original - 0) * 100) / 100;
                    const debtItem = document.createElement('div');
                    debtItem.className = 'detailed-balance-item';
                    debtItem.innerHTML = `
                        <span class="debt-label"><span class="creditor-name">${creditor}</span></span>
                        <span class="debt-amount">$${amount.toFixed(2)}</span>
                        <button class='mark-paid-btn' title='Mark as Paid'>💵</button>
                    `;
                    // Add event listener for the button
                    debtItem.querySelector('.mark-paid-btn').addEventListener('click', () => {
                        showMarkPaidModal(debtor, creditor, amount);
                    });
                    balancesList.appendChild(debtItem);
                });
            }
        });
        if (!hasDebts) {
            const noDebts = document.createElement('div');
            noDebts.className = 'detailed-balance-item';
            noDebts.style.color = '#38a169';
            noDebts.style.fontWeight = 'bold';
            noDebts.style.margin = '1.5em 0';
            noDebts.style.fontSize = '1.15em';
            noDebts.style.textAlign = 'center';
            noDebts.innerHTML = `<svg style="vertical-align:middle;margin-right:0.5em;" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38a169" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2l4-4"/></svg>All settled up!`;
            balancesList.appendChild(noDebts);
        }

        // --- Payments Section ---
        // Ensure payments array exists
        if (!currentTrip.payments) currentTrip.payments = [];
        // Show all payments history
        if (currentTrip.payments.length > 0) {
            const paymentsCard = document.createElement('div');
            paymentsCard.className = 'payments-card';

            const paymentsHeader = document.createElement('div');
            paymentsHeader.className = 'payments-header';
            paymentsHeader.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>Payments history`;
            paymentsCard.appendChild(paymentsHeader);

            currentTrip.payments.slice().reverse().forEach(payment => {
                const paymentLine = document.createElement('div');
                paymentLine.className = 'payment-line';
                paymentLine.innerHTML = `
                    <span class="payment-text">
                        <span class="payment-from">${payment.from}</span>
                        <span class="payment-verb">paid</span>
                        <span class="payment-to">${payment.to}</span>
                        <span class="payment-amount">$${Number(payment.amount).toFixed(2)}</span>
                    </span>
                `;
                paymentsCard.appendChild(paymentLine);
            });
            balancesList.appendChild(paymentsCard);
        }
    }

    // Show a modal to mark a payment
    function showMarkPaidModal(from, to, maxAmount) {
        // Remove any existing modal
        const oldModal = document.getElementById('markPaidModal');
        if (oldModal) oldModal.remove();
        // Round maxAmount to two decimals to avoid floating point issues
        maxAmount = Math.round(maxAmount * 100) / 100;
        // Create modal
        const modal = document.createElement('div');
        modal.id = 'markPaidModal';
        modal.className = 'mark-paid-modal';
        modal.innerHTML = `
            <div class="mark-paid-modal-content">
                <h3>Mark as Paid</h3>
                <div class="mark-paid-modal-desc">How much did <b class='debtor'>${from}</b> pay <b class='creditor'>${to}</b>?</div>
                <form id="markPaidForm">
                    <input type="number" id="markPaidAmount" min="0.01" max="${maxAmount.toFixed(2)}" step="0.01" value="${maxAmount.toFixed(2)}" required />
                    <div class="mark-paid-modal-actions">
                        <button type="submit" class="mark-paid-confirm">Confirm</button>
                        <button type="button" id="cancelMarkPaid" class="mark-paid-cancel">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        document.body.classList.add('modal-open');
        // Prevent more than two decimals in the input
        const markPaidAmountInput = document.getElementById('markPaidAmount');
        markPaidAmountInput.addEventListener('input', function() {
            let value = this.value;
            if (value.includes('.')) {
                const [intPart, decPart] = value.split('.');
                if (decPart && decPart.length > 2) {
                    this.value = intPart + '.' + decPart.slice(0, 2);
                }
            }
        });
        // Cancel button
        document.getElementById('cancelMarkPaid').onclick = () => {
            modal.remove();
            document.body.classList.remove('modal-open');
        };
        // Form submit
        document.getElementById('markPaidForm').onsubmit = (e) => {
            e.preventDefault();
            const amount = parseFloat(document.getElementById('markPaidAmount').value);
            if (isNaN(amount) || amount <= 0 || amount > maxAmount) {
                alert('Please enter a valid amount.');
                return;
            }
            // Add payment
            currentTrip.payments.push({from, to, amount, date: new Date().toISOString()});
            // Update localStorage
            const tripIndex = trips.findIndex(trip => trip.id === currentTrip.id);
            if (tripIndex !== -1) {
                trips[tripIndex] = currentTrip;
                localStorage.setItem('trips', JSON.stringify(trips));
            }
            // Refresh UI
            modal.remove();
            document.body.classList.remove('modal-open');
            //renderDetailedBalances();
            calculateBalances();
        };
    }

    // Setup event listeners
    function setupEventListeners() {
        addExpenseBtn.addEventListener('click', () => {
            addExpenseModal.style.display = 'flex';
            document.body.classList.add('modal-open');
            populateExpenseForm();
        });

        addDetailedExpenseBtn.addEventListener('click', () => {
            // Redirect to bill splitter with trip pre-selected
            const tripData = encodeURIComponent(JSON.stringify({
                id: currentTrip.id,
                name: currentTrip.name,
                members: currentTrip.members
            }));
            //window.location.href = `/?trip=${tripData}`;
            window.location.href = "/expense";
        });

        closeAddExpenseModal.addEventListener('click', () => {
            addExpenseModal.style.display = 'none';
            document.body.classList.remove('modal-open');
            resetExpenseForm();
        });

        cancelAddExpense.addEventListener('click', () => {
            addExpenseModal.style.display = 'none';
            document.body.classList.remove('modal-open');
            resetExpenseForm();
        });

        // Close modal when clicking outside
        addExpenseModal.addEventListener('click', (e) => {
            if (e.target === addExpenseModal) {
                addExpenseModal.style.display = 'none';
                document.body.classList.remove('modal-open');
                resetExpenseForm();
            }
        });

        // Handle form submission
        addExpenseForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addExpense();
        });

        // Add member event listeners
        addMemberBtn.addEventListener('click', () => {
            addMemberModal.style.display = 'flex';
            newMemberNameInput.focus();
        });

        closeAddMemberModal.addEventListener('click', () => {
            addMemberModal.style.display = 'none';
            resetAddMemberForm();
        });

        cancelAddMember.addEventListener('click', () => {
            addMemberModal.style.display = 'none';
            resetAddMemberForm();
        });

        // Close add member modal when clicking outside
        addMemberModal.addEventListener('click', (e) => {
            if (e.target === addMemberModal) {
                addMemberModal.style.display = 'none';
                resetAddMemberForm();
            }
        });

        // Handle add member form submission
        addMemberForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addMember();
        });
    }

    // Populate expense form
    function populateExpenseForm() {
        // Populate paid by select
        expensePaidBySelect.innerHTML = '';
        currentTrip.members.forEach(member => {
            const option = document.createElement('option');
            option.value = member;
            option.textContent = member;
            expensePaidBySelect.appendChild(option);
        });

        // Populate split options
        splitOptions.innerHTML = '';
        currentTrip.members.forEach(member => {
            const splitOption = document.createElement('div');
            splitOption.className = 'split-option selected';
            splitOption.innerHTML = `
                <input type="checkbox" id="split-${member}" value="${member}" checked>
                <label for="split-${member}">${member}</label>
            `;
            const checkbox = splitOption.querySelector('input[type="checkbox"]');
            // Only update .selected class on checkbox change
            checkbox.addEventListener('change', () => {
                splitOption.classList.toggle('selected', checkbox.checked);
            });
            splitOptions.appendChild(splitOption);
        });
    }

    // Add expense
    function addExpense() {
        const name = expenseNameInput.value.trim();
        const amount = parseFloat(expenseAmountInput.value);
        const paidBy = expensePaidBySelect.value;
        
        // Get selected members for splitting
        const selectedMembers = Array.from(splitOptions.querySelectorAll('input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.value);
        
        if (!name || isNaN(amount) || amount <= 0 || !paidBy || selectedMembers.length === 0) {
            alert('Please fill in all fields correctly');
            return;
        }

        // --- Begin: detailedSplit structure for quick expense ---
        // Calculate equal share for each selected member
        const shareAmount = parseFloat((amount / selectedMembers.length).toFixed(2));
        let remainder = parseFloat((amount - shareAmount * selectedMembers.length).toFixed(2));
        const personShares = {};
        selectedMembers.forEach((member, idx) => {
            // Distribute any rounding remainder to the first person(s)
            let share = shareAmount;
            if (remainder > 0) {
                share += 0.01;
                remainder -= 0.01;
            }
            personShares[member] = share;
        });
        const detailedSplit = {
            items: [
                {
                    name: name,
                    quantity: 1,
                    unitPrice: amount,
                    totalPrice: amount,
                    assignments: Object.fromEntries(selectedMembers.map(m => [m, { quantity: 1, share: personShares[m] }]))
                }
            ],
            personShares: personShares
        };
        // --- End: detailedSplit structure for quick expense ---

        const expense = {
            id: Date.now().toString(),
            name,
            amount,
            paidBy,
            splitBetween: selectedMembers,
            createdAt: new Date().toISOString(),
            detailedSplit: detailedSplit
        };

        // Add expense to trip
        if (!currentTrip.expenses) {
            currentTrip.expenses = [];
        }
        currentTrip.expenses.unshift(expense);

        // Update localStorage
        const tripIndex = trips.findIndex(trip => trip.id === tripId);
        if (tripIndex !== -1) {
            trips[tripIndex] = currentTrip;
            localStorage.setItem('trips', JSON.stringify(trips));
        }

        // Update display
        displayExpenses();
        updateTripSummary();
        calculateBalances();

        // Close modal and reset form
        addExpenseModal.style.display = 'none';
        document.body.classList.remove('modal-open');
        resetExpenseForm();
    }

    // Reset expense form
    function resetExpenseForm() {
        addExpenseForm.reset();
        splitOptions.innerHTML = '';
    }

    // Add member function
    function addMember() {
        const memberName = newMemberNameInput.value.trim();
        
        if (!memberName) {
            alert('Please enter a member name');
            return;
        }

        // Check if member already exists
        if (currentTrip.members.includes(memberName)) {
            alert('This member already exists in the trip');
            return;
        }

        // Add member to trip
        currentTrip.members.push(memberName);

        // Update localStorage
        const tripIndex = trips.findIndex(trip => trip.id === tripId);
        if (tripIndex !== -1) {
            trips[tripIndex] = currentTrip;
            localStorage.setItem('trips', JSON.stringify(trips));
        }

        // Update display
        displayTripMembers();
        updateTripSummary();
        calculateBalances();
        displayBalancesPreview();

        // Close modal and reset form
        addMemberModal.style.display = 'none';
        resetAddMemberForm();
    }

    // Reset add member form
    function resetAddMemberForm() {
        addMemberForm.reset();
    }

    // Remove member function (global for onclick)
    window.removeMember = function(memberName) {
        // Don't allow removing if there are expenses and this member is involved
        if (currentTrip.expenses && currentTrip.expenses.length > 0) {
            const memberInExpenses = currentTrip.expenses.some(expense => 
                expense.paidBy === memberName || expense.splitBetween.includes(memberName)
            );
            
            if (memberInExpenses) {
                alert('Cannot remove member who is involved in existing expenses. Please delete or modify the expenses first.');
                return;
            }
        }

        // Confirm removal
        if (!confirm(`Are you sure you want to remove ${memberName} from the trip?`)) {
            return;
        }

        // Remove member from trip
        currentTrip.members = currentTrip.members.filter(member => member !== memberName);

        // Update localStorage
        const tripIndex = trips.findIndex(trip => trip.id === tripId);
        if (tripIndex !== -1) {
            trips[tripIndex] = currentTrip;
            localStorage.setItem('trips', JSON.stringify(trips));
        }

        // Update display
        displayTripMembers();
        updateTripSummary();
        calculateBalances();
    };

    // Initialize the page
    initTripPage();
}); 