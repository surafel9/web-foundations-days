const loadUsersBtn = document.getElementById('load-users');
const filterInput = document.getElementById('filter-input');
const statusP = document.getElementById('status');
const usersList = document.getElementById('users-list');

let allUsers = [];

async function loadUsers() {
    loadUsersBtn.disabled = true;
    statusP.textContent = 'Loading users...';
    usersList.innerHTML = ''; // Clear existing list
    allUsers = [];
    
    try {
        const response = await fetch('https://jsonplaceholder.typicode.com/users');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        allUsers = await response.json();
        
        statusP.textContent = 'Users loaded successfully!';
        renderUsers(allUsers);
        
    } catch (error) {
        statusP.textContent = `Error loading users: ${error.message}`;
    } finally {
        loadUsersBtn.disabled = false;
    }
}

function renderUsers(list) {
    usersList.innerHTML = '';
    
    if (list.length === 0) {
        usersList.innerHTML = '<li>No users match your filter.</li>';
        return;
    }
    
    list.forEach(user => {
        const li = document.createElement('li');
        
        // Name, email, city and company name
        const nameSpan = document.createElement('strong');
        nameSpan.textContent = user.name;
        
        const detailsSpan = document.createElement('span');
        detailsSpan.textContent = ` - ${user.email} - ${user.address.city} - ${user.company.name}`;
        
        li.appendChild(nameSpan);
        li.appendChild(detailsSpan);
        
        usersList.appendChild(li);
    });
}

loadUsersBtn.addEventListener('click', loadUsers);

filterInput.addEventListener('input', (e) => {
    const filterText = e.target.value.toLowerCase();
    const filteredUsers = allUsers.filter(user => 
        user.name.toLowerCase().includes(filterText)
    );
    renderUsers(filteredUsers);
});
