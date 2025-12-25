const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQY3X20AFaDYSVOwGls8Ps2nQeVbiWVhybs6SMXgd05ptpJb5opAkPzQ1SVxsU0NFXkcWunmDpr7g7Z/pub?gid=433722107&single=true&output=csv';

let allProjects = [];

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.protocol === 'file:') {
        console.warn("Running from file:// protocol.");
    }
    fetchData();
    setupEventListeners();
    setupModal();
});

// Toggle fullscreen mode for table
function toggleFullscreen() {
    const container = document.querySelector('.results-table-container');
    const btn = container.querySelector('.fullscreen-btn');
    container.classList.toggle('fullscreen');

    if (container.classList.contains('fullscreen')) {
        btn.innerHTML = '<i class="fa-solid fa-compress"></i> 終了';
        document.body.style.overflow = 'hidden';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-expand"></i> 全画面';
        document.body.style.overflow = '';
    }
}

// Allow ESC key to exit fullscreen
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const container = document.querySelector('.results-table-container');
        if (container && container.classList.contains('fullscreen')) {
            toggleFullscreen();
        }
    }
});

// Keep fullscreen button fixed during horizontal and vertical scroll
document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.results-table-container');
    if (container) {
        container.addEventListener('scroll', () => {
            const btn = container.querySelector('.fullscreen-btn');
            if (btn) {
                // Move button with scroll to keep it in same visual position
                btn.style.right = `${10 - container.scrollLeft}px`;
                btn.style.top = `${50 + container.scrollTop}px`;
            }
        });
    }
});

function fetchData() {
    Papa.parse(SHEET_CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            const loadingState = document.getElementById('loadingState');
            if (loadingState) loadingState.style.display = 'none';

            if (results.data.length === 0) {
                showError("データが見つかりませんでした。");
                return;
            }

            try {
                allProjects = transformData(results.data);
                // Update total count
                const totalSpan = document.getElementById('totalCount');
                if (totalSpan) totalSpan.textContent = allProjects.length;
                populateFilters(allProjects);
                renderProjects(allProjects);
            } catch (e) {
                console.error(e);
                showError(`データ処理エラー: ${e.message}`);
            }
        },
        error: function (err) {
            console.error("PapaParse Error:", err);
            const loadingState = document.getElementById('loadingState');
            if (loadingState) loadingState.style.display = 'none';
            showError("データの読み込みに失敗しました。");
        }
    });
}

function showError(msg) {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 40px; color: #ef4444;">${msg}</td></tr>`;
}

function transformData(rawData) {
    return rawData.map(row => {
        const findKey = (keywords) => {
            const keys = Object.keys(row);
            return keys.find(k => {
                const normK = k.replace(/\s+/g, '').replace(/[\n\r]/g, '');
                return keywords.some(kw => normK.includes(kw));
            });
        };

        const K_CATEGORY = findKey(['種別']);
        const K_ID = findKey(['案件番号']);
        const K_STATUS = findKey(['状態']);
        const K_TITLE = findKey(['案件名']);
        const K_DESC = findKey(['業務', '作業', '概要']);
        const K_SKILL = findKey(['スキル']);
        const K_LOC = findKey(['場所', '勤務地']);
        const K_PERIOD = findKey(['期間']);
        const K_PRICE = findKey(['単金']);
        const K_TYPE = findKey(['契約形態']);
        const K_INTERVIEW = findKey(['打合せ']);
        const K_FOREIGN = findKey(['外国籍']);
        const K_SUBCONTRACT = findKey(['再委託']);

        // Find 'Others' or 'Remarks' column, strictly excluding 'Skills' or 'Language' to avoid false positives
        const K_OTHERS = Object.keys(row).find(k => {
            const normK = k.replace(/\s+/g, '').replace(/[\n\r]/g, '');
            if (normK.includes('備考')) return true;
            if (normK.includes('その他') && !normK.includes('スキル') && !normK.includes('言語') && !normK.includes('要件')) return true;
            return false;
        });

        // R列 - 案件PR or コピー用テキスト
        const K_COPYTEXT = findKey(['案件PR', 'PR', 'コピー']);
        const keys = Object.keys(row);
        const copyTextValue = row[K_COPYTEXT] || (keys.length >= 18 ? row[keys[17]] : '');

        return {
            id: row[K_ID] || '',
            category: row[K_CATEGORY] || '',
            status: row[K_STATUS] || '',
            title: row[K_TITLE] || '案件名なし',
            description: row[K_DESC] || '',
            skills: row[K_SKILL] || '',
            location: row[K_LOC] || '',
            period: row[K_PERIOD] || '',
            price: row[K_PRICE] || '',
            type: row[K_TYPE] || '',
            interview: row[K_INTERVIEW] || '',
            foreign: row[K_FOREIGN] || '',
            subcontract: row[K_SUBCONTRACT] || '',
            others: row[K_OTHERS] || '',
            copyText: copyTextValue,
            raw: row
        };
    }).filter(item => item.title && item.title !== '案件名なし');
}


function populateFilters(projects) {
    const categoryContainer = document.getElementById('categoryFilterContainer');
    const contractContainer = document.getElementById('contractFilterContainer');

    // Reset containers
    categoryContainer.innerHTML = '';
    contractContainer.innerHTML = '';

    // Get unique categories and contract types
    const categories = new Set();
    const contractTypes = new Set();

    projects.forEach(p => {
        if (p.category) categories.add(p.category.trim());
        if (p.type) contractTypes.add(p.type.trim());
    });

    // Create category checkboxes with custom order (開発系, インフラ, ERP first)
    const priorityOrder = ['開発系', 'インフラ', 'ERP'];
    const sortedCategories = Array.from(categories).sort((a, b) => {
        const aIndex = priorityOrder.indexOf(a);
        const bIndex = priorityOrder.indexOf(b);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.localeCompare(b, 'ja');
    });

    sortedCategories.forEach(cat => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = cat;
        input.addEventListener('change', doFilter);
        label.appendChild(input);
        label.appendChild(document.createTextNode(` ${cat}`));
        categoryContainer.appendChild(label);
    });

    // Create contract type checkboxes (FIXED: only 準委任 and 派遣)
    const fixedContractTypes = ['準委任', '派遣'];
    fixedContractTypes.forEach(type => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = type;
        input.addEventListener('change', doFilter);
        label.appendChild(input);
        label.appendChild(document.createTextNode(` ${type}`));
        contractContainer.appendChild(label);
    });
}

// Global Sort State
let currentSort = {
    key: null,
    asc: true
};

function handleSort(key) {
    if (currentSort.key === key) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.key = key;
        currentSort.asc = true;
    }

    updateSortHeaders();

    // Trigger re-render with current filters
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.dispatchEvent(new Event('input')); // Re-trigger filter which calls render
    }
}

function updateSortHeaders() {
    const ths = document.querySelectorAll('th[data-sort]');
    ths.forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === currentSort.key) {
            th.classList.add(currentSort.asc ? 'sort-asc' : 'sort-desc');
        }
    });
}

// Enhanced Render with Sort
function renderProjects(projects) {
    const container = document.getElementById('resultsContainer');
    const countSpan = document.getElementById('resultCount');

    // Store filtered projects globally for modal navigation
    window.currentFilteredProjects = projects;

    // Sort logic
    if (currentSort.key) {
        projects.sort((a, b) => {
            let valA = a[currentSort.key] || '';
            let valB = b[currentSort.key] || '';

            // Numerical sort for price (extract number)
            if (currentSort.key === 'price') {
                const numA = parseInt((valA.match(/\d+/) || ['0'])[0]);
                const numB = parseInt((valB.match(/\d+/) || ['0'])[0]);
                return currentSort.asc ? numA - numB : numB - numA;
            }

            // String sort
            valA = valA.toString().toLowerCase();
            valB = valB.toString().toLowerCase();

            if (valA < valB) return currentSort.asc ? -1 : 1;
            if (valA > valB) return currentSort.asc ? 1 : -1;
            return 0;
        });
    }

    container.innerHTML = '';
    countSpan.textContent = projects.length;

    if (projects.length === 0) {
        container.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 40px; color:#aaa;">条件に一致する案件が見つかりませんでした。</td></tr>';
        return;
    }

    // Get current search query for highlighting
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value.trim() : '';

    const fragment = document.createDocumentFragment();

    projects.forEach(project => {
        const tr = document.createElement('tr');

        // Status Badge logic
        const isNew = project.status && project.status.includes('新規');
        // Badge is lighter/smaller for list view
        const statusBadge = project.status ? `<span class="status-badge ${isNew ? 'new' : ''}" style="margin-left:6px; font-size:0.7rem; padding:1px 6px;">${escapeHtml(project.status)}</span>` : '';

        // Use highlight function for searchable fields
        const titleHtml = highlightText(project.title, query);
        const descHtml = highlightText(project.description, query);
        const skillsHtml = highlightText(project.skills, query);

        // Escape copyText for data attribute
        const copyTextEscaped = escapeHtml(project.copyText || '');

        tr.innerHTML = `
            <td class="sticky-col col-0">
                ${escapeHtml(project.category)}
                ${statusBadge}
            </td>
            <td class="col-title sticky-col col-1">
                <div>${titleHtml}</div>
                <div style="font-size: 0.75rem; color: #94a3b8; font-weight: 400; margin-top: 2px;">${escapeHtml(project.id)}</div>
                <div class="row-btn-group">
                    <button class="copy-row-btn" data-copytext="${copyTextEscaped}" onclick="copyRowDetail(this, event)">
                        <i class="fa-solid fa-copy"></i> コピー
                    </button>
                    <button class="detail-row-btn" onclick="openModalFromRow(this, event)" data-project-index="${projects.indexOf(project)}">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> 詳細
                    </button>
                </div>
            </td>
            <td class="col-skills">
                ${descHtml}
            </td>
            <td class="col-skills">${skillsHtml}</td>
            <td>${escapeHtml(project.location)}</td>
            <td>${escapeHtml(project.period)}</td>
            <td class="col-price">${escapeHtml(project.price)}</td>
            <td>${escapeHtml(project.type)}</td>
            <td>${escapeHtml(project.foreign)}</td>
            <td>${escapeHtml(project.subcontract)}</td>
            <td>${escapeHtml(project.others)}</td>
        `;

        tr.addEventListener('click', (e) => {
            // Check if text is selected; if so, don't open modal (UX improvement)
            const selection = window.getSelection();
            if (selection.toString().length > 0) return;
            openModal(project);
        });

        fragment.appendChild(tr);
    });

    container.appendChild(fragment);

    // Sort headers setup (only once needed really, but here is safe)
    setupHeaderClicks();

    // Apply dynamic sticky to short cells
    applyDynamicSticky();
}

// Apply sticky positioning to cells shorter than their row
function applyDynamicSticky() {
    const rows = document.querySelectorAll('.project-table tbody tr');
    const headerHeight = 45; // Height of sticky header

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 0) return;

        // Get the max height of any cell in this row
        let maxHeight = 0;
        cells.forEach(cell => {
            const cellHeight = cell.scrollHeight;
            if (cellHeight > maxHeight) maxHeight = cellHeight;
        });

        // If row is tall enough to need sticky behavior
        const threshold = 150; // Minimum row height to apply sticky
        if (maxHeight > threshold) {
            cells.forEach(cell => {
                const cellHeight = cell.scrollHeight;
                // If this cell is shorter than the max, make it sticky
                if (cellHeight < maxHeight * 0.7) {
                    cell.style.position = 'sticky';
                    cell.style.top = `${headerHeight}px`;
                    cell.style.alignSelf = 'flex-start';
                }
            });
        }
    });
}

function setupHeaderClicks() {
    const ths = document.querySelectorAll('th[data-sort]');
    ths.forEach(th => {
        // Remove old listeners to prevent duplicates if re-rendered
        // Since headers are static in HTML, this is actually fine to call once. 
        // But to be safe, we can just ensure we check if listener attached or just attach once in DOMContentLoaded.
        // Better: Attach in setupEventListeners globally, not here.
        th.removeEventListener('click', th._sortHandler); // Remove previous handler if exists
        th._sortHandler = () => handleSort(th.dataset.sort); // Store handler to remove later
        th.addEventListener('click', th._sortHandler);
    });
}

function enableColumnResizing() {
    const table = document.querySelector('.project-table');
    const cols = table.querySelectorAll('th');

    cols.forEach(col => {
        // Remove old resizer
        if (col.querySelector('.resizer')) col.querySelector('.resizer').remove();

        const resizer = document.createElement('div');
        resizer.classList.add('resizer');

        // Prevent sorting when clicking resizer
        resizer.addEventListener('click', (e) => e.stopPropagation());

        col.appendChild(resizer);
        createResizableColumn(col, resizer);
    });
}

function createResizableColumn(col, resizer) {
    let x = 0;
    let w = 0;

    const mouseDownHandler = (e) => {
        e.stopPropagation(); // Stop sort
        x = e.clientX;
        const styles = window.getComputedStyle(col);
        w = parseInt(styles.width, 10);

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        resizer.classList.add('resizing');
    };

    const mouseMoveHandler = (e) => {
        const dx = e.clientX - x;
        // Allow Shrinking: Only limit is > 10px so it doesn't disappear
        const newW = Math.max(10, w + dx);
        col.style.width = `${newW}px`;
        col.style.minWidth = `${newW}px`;
    };

    const mouseUpHandler = () => {
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
        resizer.classList.remove('resizing');
    };

    resizer.addEventListener('mousedown', mouseDownHandler);
}

function generateSkillTags(skillsStr, limit) {
    // Legacy helper kept if needed, but we now use raw text for table
    if (!skillsStr) return '';
    const skills = skillsStr.split(/[\n,、]/)
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('①') && !s.startsWith('②') && s.length < 20);

    return skills.slice(0, limit).map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('');
}

// --- MODAL LOGIC ---
function setupModal() {
    const modal = document.getElementById("projectModal");
    const span = document.getElementsByClassName("close-modal")[0];

    span.onclick = function () {
        modal.style.display = "none";
    }

    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }
}

function openModal(project) {
    const modal = document.getElementById("projectModal");
    const body = document.getElementById("modalBody");

    // Navigation Logic
    const currentProjects = window.currentFilteredProjects || [];
    const currentIndex = currentProjects.indexOf(project);
    const prevProject = currentIndex > 0 ? currentProjects[currentIndex - 1] : null;
    const nextProject = currentIndex !== -1 && currentIndex < currentProjects.length - 1 ? currentProjects[currentIndex + 1] : null;

    // Nav Buttons HTML (Top)
    const navButtonsTop = `
        <div class="modal-header-nav">
            <button class="modal-nav-btn prev" ${!prevProject ? 'disabled' : ''} onclick="navigateModal(${currentIndex - 1})">
                <i class="fa-solid fa-chevron-left"></i> 前へ
            </button>
            <button class="modal-nav-btn next" ${!nextProject ? 'disabled' : ''} onclick="navigateModal(${currentIndex + 1})">
                次へ <i class="fa-solid fa-chevron-right"></i>
            </button>
        </div>
    `;

    // Nav Buttons HTML (Bottom)
    const navButtonsBottom = `
        <div class="modal-nav-bottom">
            <button class="modal-nav-btn prev" ${!prevProject ? 'disabled' : ''} onclick="navigateModal(${currentIndex - 1})">
                <i class="fa-solid fa-chevron-left"></i> 前の案件
            </button>
            <button class="modal-nav-btn next" ${!nextProject ? 'disabled' : ''} onclick="navigateModal(${currentIndex + 1})">
                次の案件 <i class="fa-solid fa-chevron-right"></i>
            </button>
        </div>
    `;

    const isNew = project.status && project.status.includes('新規');
    // Reserve space for status even if empty to prevent layout shift
    const statusHtml = project.status
        ? `<div class="status-badge ${isNew ? 'new' : ''}" style="margin-bottom:8px; display:inline-block;">${escapeHtml(project.status)}</div>`
        : `<div style="height: 24px; margin-bottom: 8px;"></div>`;

    // Store copyText for the copy button
    window.currentProjectCopyText = project.copyText || '';

    // Fields to exclude from "その他の情報"
    const excludeKeywords = ['種別', 'ERP', '案件番号', '案件名', '業務', '作業', '概要', 'スキル要件', 'スキル', '必須', '経験', '状態'];

    // Generate all columns display (except R column and excluded fields)
    const rawKeys = Object.keys(project.raw || {});
    const rColumnIndex = 17; // R is 18th column (0-indexed = 17)
    const allColumnsHtml = rawKeys
        .filter((key, index) => {
            if (index === rColumnIndex) return false;
            if (!project.raw[key]) return false;
            // Check if key contains any excluded keyword
            const keyLower = key.toLowerCase();
            return !excludeKeywords.some(exc => keyLower.includes(exc.toLowerCase()));
        })
        .map(key => `
            <div class="info-grid-item">
                <label>${escapeHtml(key)}</label>
                <p>${escapeHtml(project.raw[key])}</p>
            </div>
        `).join('');

    body.innerHTML = `
        ${navButtonsTop}
        <div class="modal-header" style="position: relative;">
            <button class="copy-detail-btn" onclick="copyProjectDetail()">
                <i class="fa-solid fa-copy"></i> 詳細をコピー
            </button>
            ${statusHtml}
            <div style="font-size:0.85rem; color:#94a3b8;">${escapeHtml(project.id)} / ${escapeHtml(project.category)}</div>
            <h2 class="modal-title">${escapeHtml(project.title)}</h2>
        </div>

        <div class="info-grid info-grid-main">
            ${allColumnsHtml}
        </div>

        <div class="info-item">
            <label><i class="fa-solid fa-code"></i> 必要スキル</label>
            <div class="modal-description">${escapeHtml(project.skills)}</div>
        </div>

        <div class="info-item">
            <label><i class="fa-solid fa-file-lines"></i> 案件詳細 / 業務内容</label>
            <div class="modal-description">${escapeHtml(project.description)}</div>
        </div>
        
        ${navButtonsBottom}
        `;

    modal.style.display = "block";
}

// Function to handle modal navigation
function navigateModal(index) {
    const projects = window.currentFilteredProjects || [];
    if (index >= 0 && index < projects.length) {
        openModal(projects[index]);
    }
}

// Copy R column text to clipboard
function copyProjectDetail() {
    const text = window.currentProjectCopyText || '';
    if (!text) {
        alert('コピーするテキストがありません');
        return;
    }

    navigator.clipboard.writeText(text).then(() => {
        // Show success feedback
        const btn = document.querySelector('.copy-detail-btn');
        if (btn) {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> コピー完了';
            btn.style.background = '#10b981';
            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.style.background = '';
            }, 2000);
        }
    }).catch(err => {
        console.error('Copy failed:', err);
        alert('コピーに失敗しました');
    });
}

// Copy from table row button
function copyRowDetail(btn, event) {
    event.stopPropagation(); // Prevent row click from opening modal

    const text = btn.getAttribute('data-copytext') || '';
    if (!text) {
        alert('コピーするテキストがありません');
        return;
    }

    navigator.clipboard.writeText(text).then(() => {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        btn.style.background = '#10b981';
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.style.background = '';
        }, 1500);
    }).catch(err => {
        console.error('Copy failed:', err);
        alert('コピーに失敗しました');
    });
}

// Open modal from table row detail button
function openModalFromRow(btn, event) {
    event.stopPropagation();
    const index = parseInt(btn.getAttribute('data-project-index'));
    if (!isNaN(index) && allProjects[index]) {
        openModal(allProjects[index]);
    }
}
// -------------------

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Highlight matching text with orange color
function highlightText(text, query) {
    if (!text) return '';
    if (!query) return escapeHtml(text);

    const escaped = escapeHtml(text);
    const escapedQuery = escapeHtml(query);

    // Case-insensitive replacement
    const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<span class="highlight">$1</span>');
}

function setupEventListeners() {
    // Initial resize setup for headers
    enableColumnResizing();

    const searchInput = document.getElementById('searchInput');

    // Attach event listener to search input
    searchInput.addEventListener('input', () => doFilter());

    // Sort handlers
    const ths = document.querySelectorAll('th[data-sort]');
    ths.forEach(th => {
        th.addEventListener('click', () => {
            handleSort(th.dataset.sort);
        });
    });
}

// Global doFilter function
function doFilter() {
    const searchInput = document.getElementById('searchInput');
    const queryRaw = searchInput ? searchInput.value.trim() : '';

    // Split by space for AND search
    const keywords = queryRaw.toLowerCase().split(/\s+/).filter(k => k.length > 0);

    // Get selected categories from checkboxes
    const catCheckboxes = document.querySelectorAll('#categoryFilterContainer input:checked');
    const selectedCats = Array.from(catCheckboxes).map(cb => cb.value);

    // Get selected contracts from checkboxes
    const contractCheckboxes = document.querySelectorAll('#contractFilterContainer input:checked');
    const selectedContracts = Array.from(contractCheckboxes).map(cb => cb.value);

    // Filter Logic
    const filtered = allProjects.filter(p => {
        // Text Search - AND logic: all keywords must match
        const searchableText = `${p.title || ''} ${p.skills || ''} ${p.description || ''}`.toLowerCase();
        const textMatch = keywords.length === 0 || keywords.every(kw => searchableText.includes(kw));

        // Category Match (OR logic - if any selected, item must match one of them)
        const catMatch = selectedCats.length === 0 || selectedCats.includes(p.category);

        // Contract Match (OR logic - PARTIAL MATCH: 準委任 matches "準委任契約" etc.)
        const contractMatch = selectedContracts.length === 0 ||
            selectedContracts.some(contract => p.type && p.type.includes(contract));

        return textMatch && catMatch && contractMatch;
    });

    renderProjects(filtered);
}
