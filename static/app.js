document.addEventListener('DOMContentLoaded', () => {
    const cameraInput = document.getElementById('cameraInput');
    const uploadInput = document.getElementById('uploadInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadSection = document.getElementById('uploadSection');
    const previewSection = document.getElementById('previewSection');
    const previewImage = document.getElementById('previewImage');
    const retakeBtn = document.getElementById('retakeBtn');
    const resultsSection = document.getElementById('resultsSection');
    const itemsList = document.getElementById('itemsList');
    const loading = document.getElementById('loading');
    const personNameInput = document.getElementById('personName');
    const addPersonBtn = document.getElementById('addPersonBtn');
    const peopleList = document.getElementById('peopleList');
    const summarySection = document.getElementById('summarySection');
    const summaryList = document.getElementById('summaryList');
    const addItemBtn = document.getElementById('addItemBtn');
    const addItemForm = document.getElementById('addItemForm');
    const newItemName = document.getElementById('newItemName');
    const newItemQuantity = document.getElementById('newItemQuantity');
    const newItemPrice = document.getElementById('newItemPrice');
    const saveItemBtn = document.getElementById('saveItemBtn');
    const cancelItemBtn = document.getElementById('cancelItemBtn');
    const exportBtn = document.getElementById('exportBtn');
    const editItemForm = document.getElementById('editItemForm');
    const editItemName = document.getElementById('editItemName');
    const editItemQuantity = document.getElementById('editItemQuantity');
    const editItemPrice = document.getElementById('editItemPrice');
    const saveEditBtn = document.getElementById('saveEditBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const manualInputBtn = document.getElementById('manualInputBtn');
    const setBillNameBtn = document.getElementById('setBillNameBtn');
    const billName = document.getElementById('billName');
    const nameSelector = document.getElementById('nameSelector');


    let people = [];
    let items = [];
    let itemAssignments = {};
    let receiptImageBase64 = null;
    let currentEditIndex = -1;
    let nameSelected = null;
	let personItem = [];

	function getPersonItem(name, item, extraData = {}) {
		const existing = personItem.find(obj => obj.name === name && obj.item === item);
		if (existing) {
			Object.assign(existing, extraData);
		}
		else {
			personItem.push({name, item, ...extraData});
		}

		console.log(personItem);
	}

    function updateNames() {
        nameSelector.innerHTML = "";
        people.forEach(name => {
            const btn = document.createElement('div');
            btn.classList.add('name-option')
            btn.textContent = name;
            btn.addEventListener('click', () => {
            document.querySelectorAll('.name-option').forEach(el => el.classList.remove('selected'));
            btn.classList.add('selected');

            nameSelected = name;
                document.getElementById('payedBy').textContent = 'Pagado por ' + name;
            });

            nameSelector.appendChild(btn);
        });
    }

    // Convert File to Base64
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }


    manualInputBtn.addEventListener('click', () => {
	    resultsSection.style.display = 'block';
    });
	
    // Export summary as image
    exportBtn.addEventListener('click', async () => {
        try {
            showLoading();
            const summaryElement = document.getElementById('summarySection');
            
            // Create a clone of the summary section for better styling
            const clone = summaryElement.cloneNode(true);
            
            // Remove the export button from the clone
            const exportBtnClone = clone.querySelector('.export-btn');
            if (exportBtnClone) {
                exportBtnClone.remove();
            }
            
            clone.style.position = 'absolute';
            clone.style.left = '-9999px';
            clone.style.top = '-9999px';
            clone.style.width = '400px'; // Fixed width for better image quality
            clone.style.background = 'white';
            clone.style.padding = '2rem';
            clone.style.borderRadius = '12px';
            clone.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
            document.body.appendChild(clone);

            // Generate the image
            const canvas = await html2canvas(clone, {
                backgroundColor: 'white',
                scale: 2, // Higher quality
                logging: false,
                useCORS: true
            });

            // Remove the clone
            document.body.removeChild(clone);

            // Convert to blob
            canvas.toBlob(async (blob) => {
                try {
                    // Create a File object from the blob
                    const file = new File([blob], 'bill-summary.png', { type: 'image/png' });
                    
                    // Check if Web Share API is available
                    if (navigator.share) {
                        await navigator.share({
                            files: [file],
                            title: 'Bill Summary',
                            text: 'Here\'s the bill summary from Split The Bill!'
                        });
                    } else {
                        // Fallback to download if Web Share API is not available
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = 'bill-summary.png';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                    }
                } catch (error) {
                    console.error('Error sharing:', error);
                    alert('Failed to share the summary. Please try again.');
                }
            }, 'image/png');
        } catch (error) {
            console.error('Error exporting summary:', error);
            alert('Failed to export the summary. Please try again.');
        } finally {
            hideLoading();
        }
    });

    // Handle camera input change
    cameraInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                receiptImageBase64 = await fileToBase64(file);
                showPreview(receiptImageBase64);
                processImage(file);
            } catch (error) {
                console.error('Error converting image to base64:', error);
                alert(error);
            }
        }
    });

    // Handle upload input change
    uploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                receiptImageBase64 = await fileToBase64(file);
                showPreview(receiptImageBase64);
                processImage(file);
            } catch (error) {
                console.error('Error converting image to base64:', error);
                alert(error);
            }
        }
    });

    // Handle upload button click
    uploadBtn.addEventListener('click', () => {
        uploadInput.click();
    });

    // Show preview of captured/uploaded image
    function showPreview(imageData) {
        previewImage.src = imageData;
        uploadSection.style.display = 'none';
        previewSection.style.display = 'block';
    }

    // Handle retake photo
    retakeBtn.addEventListener('click', () => {
        previewSection.style.display = 'none';
        uploadSection.style.display = 'block';
        cameraInput.value = ''; // Reset camera input
        uploadInput.value = ''; // Reset upload input
        receiptImageBase64 = null; // Reset base64 data
    });

    // Process image and send to backend
    async function processImage(file) {
        try {
            showLoading();
            const response = await fetch('/process-receipt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image: receiptImageBase64
                })
            });

            if (!response.ok) {
                throw new Error('Failed to process image');
            }

            const data = await response.json();
            items = data.items;
            itemAssignments = {};
            displayResults(data.items);
        } catch (error) {
            console.error('Error processing image:', error);
            alert(error);
        } finally {
            hideLoading();
        }
    }

    // Display results from the API
    function displayResults(items) {
        itemsList.innerHTML = '';
        console.log(items);
        items.forEach((item, index) => {
            const itemElement = document.createElement('div');
            itemElement.className = 'item-card';
            itemElement.innerHTML = `
                <div class="item-header">
                    <div class="item-info">
                        <div class="item-name">${item.item}</div>
                        <div class="item-quantity">Quantity: ${item.quantity}</div>
                    </div>
                    <div class="item-actions">
                        <div class="item-price">$${item.price}</div>
                        <button class="edit-btn" onclick="editItem(${index})" title="Edit item">✎</button>
                        <button class="delete-btn" onclick="removeItem(${index})" title="Remove item">&times;</button>
                    </div>
                </div>
                <div class="item-people" id="itemPeople${index}">
                    <!-- Quantity assignments will be added here -->
                </div>
            `;
            itemsList.appendChild(itemElement);
            updateItemAssignments(index);
        });
        resultsSection.style.display = 'block';
	    document.getElementById('optionalInfo').style.display = 'block';
    }

    // Remove item
    window.removeItem = function(index) {
        if (confirm('Are you sure you want to remove this item?')) {
            items.splice(index, 1);
            delete itemAssignments[index];
            // Reindex the remaining assignments
            const newAssignments = {};
            Object.keys(itemAssignments).forEach(oldIndex => {
                if (oldIndex > index) {
                    newAssignments[oldIndex - 1] = itemAssignments[oldIndex];
                } else if (oldIndex < index) {
                    newAssignments[oldIndex] = itemAssignments[oldIndex];
                }
            });
            itemAssignments = newAssignments;
            displayResults(items);
            updateSummary();
        }
    };

    // Add person
    addPersonBtn.addEventListener('click', () => {
        const name = personNameInput.value.trim();
        if (name && !people.includes(name)) {
            people.push(name);
            updatePeopleList();
            updateAllItemAssignments();
            personNameInput.value = '';
		updateNames();
        }
    });

	setBillNameBtn.addEventListener('click', () => {
		const billNameText = document.getElementById('billNameInput').value;
		if (billNameText) {
			console.log(billNameText);
			billName.textContent = billNameText;
		}
	});

    // Handle Enter key in person name input
    personNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addPersonBtn.click();
        }
    });

    // Update people list
    function updatePeopleList() {
        peopleList.innerHTML = '';
        people.forEach(name => {
            const personElement = document.createElement('div');
            personElement.className = 'person-tag';
            personElement.innerHTML = `
                ${name}
                <button onclick="removePerson('${name}')">&times;</button>
            `;
            peopleList.appendChild(personElement);
        });
    }

    // Remove person
    window.removePerson = function(name) {
        people = people.filter(p => p !== name);
        updatePeopleList();
        updateAllItemAssignments();
    };

    // Update quantity assignments for an item
    function updateItemAssignments(itemIndex) {
        const item = items[itemIndex];
        const itemPeopleDiv = document.getElementById(`itemPeople${itemIndex}`);
        if (!itemPeopleDiv) return;

        if (!itemAssignments[itemIndex]) {
            itemAssignments[itemIndex] = {};
        }

        itemPeopleDiv.innerHTML = '';
        people.forEach(name => {
            const currentQuantity = itemAssignments[itemIndex][name] || 0;
            const assignmentElement = document.createElement('div');
            assignmentElement.className = 'quantity-assignment';
            assignmentElement.innerHTML = `
                <label>${name}</label>
                <div class="quantity-controls">
                    <button class="quantity-btn" onclick="updateQuantity(${itemIndex}, '${name}', -1)" ${currentQuantity <= 0 ? 'disabled' : ''}>-</button>
                    <span class="quantity-display">${currentQuantity}</span>
                    <button class="quantity-btn" onclick="updateQuantity(${itemIndex}, '${name}', 1)" ${currentQuantity >= item.quantity ? 'disabled' : ''}>+</button>
                </div>
            `;
            itemPeopleDiv.appendChild(assignmentElement);
        });

        const totalAssigned = Object.values(itemAssignments[itemIndex]).reduce((sum, qty) => sum + qty, 0);
        const remaining = item.quantity - totalAssigned;
        
        const totalElement = document.createElement('div');
        totalElement.className = 'quantity-total';
        totalElement.textContent = `Remaining: ${remaining}`;
        itemPeopleDiv.appendChild(totalElement);
    }

    // Update all item assignments
    function updateAllItemAssignments() {
        items.forEach((_, index) => {
            updateItemAssignments(index);
        });
        updateSummary();
    }

    // Update quantity for a person on an item
    window.updateQuantity = function(itemIndex, personName, change) {
        if (!itemAssignments[itemIndex]) {
            itemAssignments[itemIndex] = {};
        }

        const currentQuantity = itemAssignments[itemIndex][personName] || 0;
        const newQuantity = currentQuantity + change;
        const item = items[itemIndex];
        const totalAssigned = Object.values(itemAssignments[itemIndex]).reduce((sum, qty) => sum + qty, 0) - currentQuantity + newQuantity;

        if (newQuantity >= 0 && newQuantity <= item.quantity && totalAssigned <= item.quantity) {
            itemAssignments[itemIndex][personName] = newQuantity;
            updateItemAssignments(itemIndex);
            updateSummary();
		    console.log(personName, item);

            if (newQuantity == 0) {
                const index = personItem.findIndex(obj => obj.name === personName && obj.item === item.item);
                if (index !== -1) {
                    personItem.splice(index, 1);
                }
                console.log(personItem);
            }
            else {
                getPersonItem(personName, item.item);
            }
        }
    };

    // Update summary
    function updateSummary() {
        const summary = {};
        people.forEach(person => {
            summary[person] = 0;
        });

        items.forEach((item, index) => {
            const price = parseFloat(item.price.replace(",", "."));
            const assignments = itemAssignments[index] || {};
            
            Object.entries(assignments).forEach(([person, quantity]) => {
                if (quantity > 0) {
                    const pricePerUnit = price;
                    summary[person] += pricePerUnit * quantity;
                }
            });
        });

        displaySummary(summary);
    }

    // Display summary
    function displaySummary(summary) {
        summaryList.innerHTML = '';
        let total = 0;
	    console.log(items);

        Object.entries(summary).forEach(([person, amount]) => {
            if (amount > 0) {
                total += amount;
                const summaryItem = document.createElement('div');
                summaryItem.className = 'summary-item';
                summaryItem.innerHTML = `
                    <span>${person}</span>
                    <span>$${amount.toFixed(2)}</span>
                `;
                summaryList.appendChild(summaryItem);
            }
        });

        if (total > 0) {
            const totalItem = document.createElement('div');
            totalItem.className = 'summary-item';
            totalItem.innerHTML = `
                <span><strong>Total</strong></span>
                <span><strong>$${total.toFixed(2)}</strong></span>
            `;
            summaryList.appendChild(totalItem);
            summarySection.style.display = 'block';
        } else {
            summarySection.style.display = 'none';
        }
    }

    // Loading state management
    function showLoading() {
        loading.style.display = 'flex';
    }

    function hideLoading() {
        loading.style.display = 'none';
    }

    // Add new item button click handler
    addItemBtn.addEventListener('click', () => {
        addItemForm.style.display = 'block';
        newItemName.focus();
    });

    // Cancel adding new item
    cancelItemBtn.addEventListener('click', () => {
        addItemForm.style.display = 'none';
        clearItemForm();
    });

    // Clear item form
    function clearItemForm() {
        newItemName.value = '';
        newItemQuantity.value = '1';
        newItemPrice.value = '';
    }

    // Save new item
    saveItemBtn.addEventListener('click', () => {
        const name = newItemName.value.trim();
        const quantity = parseInt(newItemQuantity.value);
        const price = parseFloat(newItemPrice.value);

        if (name && quantity > 0 && price >= 0) {
            const newItem = {
                item: name,
                quantity: quantity.toString(),
                price: price.toFixed(2)
            };

            items.push(newItem);
            itemAssignments[items.length - 1] = {};
            displayResults(items);
            addItemForm.style.display = 'none';
            clearItemForm();
        } else {
            alert('Please fill in all fields with valid values.');
        }
    });

    // Handle Enter key in new item form
    newItemName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            newItemQuantity.focus();
        }
    });

    newItemQuantity.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            newItemPrice.focus();
        }
    });

    newItemPrice.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveItemBtn.click();
        }
    });

    // Edit item
    window.editItem = function(index) {
        const item = items[index];
        currentEditIndex = index;
        
        // Populate the edit form
        editItemName.value = item.item;
        editItemQuantity.value = item.quantity;
        editItemPrice.value = item.price;
        
        // Show the edit form
        editItemForm.style.display = 'block';
        editItemName.focus();
    };

    // Save edited item
    saveEditBtn.addEventListener('click', () => {
        const name = editItemName.value.trim();
        const quantity = parseInt(editItemQuantity.value);
        const price = parseFloat(editItemPrice.value);

        if (name && quantity > 0 && price >= 0) {
            items[currentEditIndex] = {
                item: name,
                quantity: quantity.toString(),
                price: price.toFixed(2)
            };
            displayResults(items);
            editItemForm.style.display = 'none';
            currentEditIndex = -1;
        } else {
            alert('Please fill in all fields with valid values.');
        }
    });

    // Cancel editing
    cancelEditBtn.addEventListener('click', () => {
        editItemForm.style.display = 'none';
        currentEditIndex = -1;
    });

    // Handle Enter key in edit form
    editItemName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            editItemQuantity.focus();
        }
    });

    editItemQuantity.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            editItemPrice.focus();
        }
    });

    editItemPrice.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveEditBtn.click();
        }
    });

    // Initialize the app
    cameraInput.value = ''; // Reset camera input
    uploadInput.value = ''; // Reset upload input
}); 
