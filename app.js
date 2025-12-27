const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQY3X20AFaDYSVOwGls8Ps2nQeVbiWVhybs6SMXgd05ptpJb5opAkPzQ1SVxsU0NFXkcWunmDpr7g7Z/pub?gid=433722107&single=true&output=csv';

let allProjects = [];

// Favorites state (Set of IDs)
let favorites = new Set();

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.protocol === 'file:') {
        console.warn("Running from file:// protocol.");
    }
    fetchData();
    setupEventListeners();
    setupModal();
    checkTourAutoStart();
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
                // Restore filter selections from localStorage
                loadFilterState();
                // Finally apply all filters (query + restored filters)
                doFilter();
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

function resetAllSettings() {
    if (confirm('すべての設定（検索条件、単価範囲、列の並び順、列の幅、お気に入り）をリセットしますか？')) {
        localStorage.removeItem('ses_search_state');
        localStorage.removeItem('ses_column_order');
        localStorage.removeItem('ses_column_widths');
        localStorage.removeItem('ses_favorites');
        location.reload();
    }
}

// Global Sort State
let currentSort = {
    key: null,
    asc: true
};

// --- Dynamic Column Configuration ---
let columnOrder = [
    'category', 'title', 'description', 'skills', 'location',
    'period', 'price', 'type', 'foreign', 'subcontract', 'others'
];

const COLUMNS = {
    category: {
        id: 'category',
        label: '種別 / 状態',
        width: 100,
        sort: 'category',
        // className removed, applied dynamically
        render: (project) => {
            let statusBadge = '';
            if (project.status === '新規') {
                statusBadge = '<span class="status-badge new">New</span>';
            } else if (project.status) {
                statusBadge = `<span class="status-badge">${escapeHtml(project.status)}</span>`;
            }
            return `${escapeHtml(project.category)} ${statusBadge}`;
        }
    },
    title: {
        id: 'title',
        label: '案件名 / 番号',
        width: 280,
        sort: 'title',
        className: 'col-title', // Keeps content styling, sticky removed
        render: (project) => {
            const titleHtml = highlightText(project.title, document.getElementById('searchInput')?.value.trim());
            const copyTextEscaped = escapeHtml(project.copyText || '');
            const isFav = favorites.has(project.id);

            return `
                <div class="title-container">
                    <div class="title-main-group">
                        <div>${titleHtml}</div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px; margin-bottom: 12px;">
                            <div style="font-size: 0.75rem; color: #94a3b8; font-weight: 400;">${escapeHtml(project.id)}</div>
                            <button class="copy-title-mini-btn" title="案件名コピー" data-title-copy="${escapeHtml(project.id)}｜${escapeHtml(project.title)}" onclick="copyTitleOnly(this, event)">
                                <i class="fa-solid fa-copy"></i>
                            </button>
                        </div>
                    </div>
                    <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite('${escapeHtml(project.id)}', this, event)" title="お気に入り">
                        <i class="fa-${isFav ? 'solid' : 'regular'} fa-star"></i>
                    </button>
                </div>
                <div class="project-meta-compact">
                    <div><i class="fa-solid fa-yen-sign meta-icon"></i><span class="meta-label">単価</span>｜${escapeHtml(project.price)}</div>
                    <div><i class="fa-solid fa-file-contract meta-icon"></i><span class="meta-label">契約</span>｜${escapeHtml(project.type)}</div>
                    <div><i class="fa-solid fa-passport meta-icon"></i><span class="meta-label">外国籍</span>｜${escapeHtml(project.foreign)}</div>
                    <div><i class="fa-solid fa-location-dot meta-icon"></i><span class="meta-label">場所</span>｜${escapeHtml(project.location)}</div>
                </div>
                <div class="row-btn-group">
                    <button class="copy-row-btn" data-copytext="${copyTextEscaped}" onclick="copyRowDetail(this, event)">
                        <i class="fa-solid fa-copy"></i> 詳細コピー
                    </button>
                    <button class="detail-row-btn" onclick="openModalFromRow(this, event)" data-project-index="${allProjects.indexOf(project)}">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> 詳細を確認
                    </button>
                </div>
            `;
        }
    },
    description: {
        id: 'description',
        label: '業務概要',
        width: 400,
        sort: 'description',
        className: 'col-skills',
        render: (project) => {
            const descHtml = highlightText(project.description, document.getElementById('searchInput')?.value.trim());
            return `<div class="col-scroll">${descHtml}</div>`;
        }
    },
    skills: {
        id: 'skills',
        label: 'スキル',
        width: 400,
        sort: 'skills',
        className: 'col-skills',
        render: (project) => {
            const skillsHtml = highlightText(project.skills, document.getElementById('searchInput')?.value.trim());
            return `<div class="col-scroll">${skillsHtml}</div>`;
        }
    },
    location: {
        id: 'location',
        label: '場所',
        width: 100,
        sort: 'location',
        render: (project) => escapeHtml(project.location)
    },
    period: {
        id: 'period',
        label: '期間',
        width: 200,
        sort: 'period',
        render: (project) => escapeHtml(project.period)
    },
    price: {
        id: 'price',
        label: '単価',
        width: 100,
        sort: 'price',
        className: 'col-price',
        render: (project) => escapeHtml(project.price)
    },
    type: {
        id: 'type',
        label: '契約',
        width: 100,
        sort: 'type',
        render: (project) => escapeHtml(project.type)
    },
    foreign: {
        id: 'foreign',
        label: '外国籍',
        width: 80,
        sort: 'foreign',
        render: (project) => escapeHtml(project.foreign)
    },
    subcontract: {
        id: 'subcontract',
        label: '再委託',
        width: 80,
        sort: 'subcontract',
        render: (project) => escapeHtml(project.subcontract)
    },
    others: {
        id: 'others',
        label: 'その他',
        width: 150,
        sort: 'others',
        render: (project) => `<div class="col-scroll">${escapeHtml(project.others)}</div>`
    }
};

function loadColumnOrder() {
    const saved = localStorage.getItem('ses_column_order');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Verify all keys exist (in case of updates)
            const validKeys = parsed.filter(key => COLUMNS[key]);
            // Add any new keys that might be missing
            const allKeys = Object.keys(COLUMNS);
            const missing = allKeys.filter(key => !validKeys.includes(key));
            columnOrder = [...validKeys, ...missing];
        } catch (e) {
            console.error('Failed to load column order', e);
        }
    }
}

function saveColumnOrder() {
    localStorage.setItem('ses_column_order', JSON.stringify(columnOrder));
}

function loadColumnWidths() {
    const saved = localStorage.getItem('ses_column_widths');
    if (saved) {
        try {
            const widths = JSON.parse(saved);
            Object.keys(widths).forEach(key => {
                if (COLUMNS[key]) {
                    COLUMNS[key].width = widths[key];
                }
            });
        } catch (e) {
            console.error('Failed to load column widths', e);
        }
    }
}

function saveColumnWidths() {
    const widths = {};
    Object.keys(COLUMNS).forEach(key => {
        // COLUMNS object acts as source of truth after load/resize
        widths[key] = COLUMNS[key].width;
    });
    localStorage.setItem('ses_column_widths', JSON.stringify(widths));
}
function handleSort(key) {
    if (currentSort.key === key) {
        if (currentSort.asc) {
            currentSort.asc = false;
        } else {
            // 3rd state: reset sort
            currentSort.key = null;
            currentSort.asc = true;
        }
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

// --- Drag & Drop Header Helper ---
function renderTableHeader() {
    const theadRow = document.querySelector('.project-table thead tr');
    if (!theadRow) return;

    theadRow.innerHTML = '';

    columnOrder.forEach((key, index) => {
        const colDef = COLUMNS[key];
        if (!colDef) return;

        const th = document.createElement('th');
        th.dataset.sort = colDef.sort;
        th.style.width = colDef.width + 'px';

        // Dynamic Sticky Classes
        let classes = [];
        if (colDef.className) classes.push(colDef.className);
        if (index === 0) classes.push('sticky-col', 'col-0');
        if (index === 1) classes.push('sticky-col', 'col-1');

        if (classes.length > 0) th.className = classes.join(' ');

        th.textContent = colDef.label;

        // Add Bulk Favorite Toggle to Title Column
        if (key === 'title') {
            const allFavBtn = document.createElement('button');
            allFavBtn.className = 'header-all-fav-btn';
            const projects = window.currentFilteredProjects || [];
            const isAllFav = projects.length > 0 && projects.every(p => favorites.has(p.id));

            allFavBtn.innerHTML = `<i class="fa-${isAllFav ? 'solid' : 'regular'} fa-star"></i>`;
            allFavBtn.dataset.tooltip = isAllFav ? '一括解除' : '一括登録';
            allFavBtn.onclick = (e) => toggleAllFavorites(e);
            th.appendChild(allFavBtn);
        }

        th.draggable = true;
        th.dataset.colKey = key;

        // Drag Events
        th.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', index);
            e.dataTransfer.effectAllowed = 'move';
            th.classList.add('dragging');
        });

        th.addEventListener('dragover', (e) => {
            e.preventDefault(); // Allow drop
            e.dataTransfer.dropEffect = 'move';
            th.classList.add('drag-over');
        });

        th.addEventListener('dragleave', () => {
            th.classList.remove('drag-over');
        });

        th.addEventListener('dragend', () => {
            th.classList.remove('dragging');
            document.querySelectorAll('th').forEach(h => h.classList.remove('drag-over'));
        });
        th.addEventListener('drop', (e) => {
            e.preventDefault();
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const toIndex = index;

            if (fromIndex !== toIndex) {
                // Reorder array
                const movedKey = columnOrder[fromIndex];
                columnOrder.splice(fromIndex, 1);
                columnOrder.splice(toIndex, 0, movedKey);

                // Save and Re-render
                saveColumnOrder();
                renderTableHeader();
                // Re-render body with new order
                renderProjects(window.currentFilteredProjects || allProjects);
                // Re-apply sort styling
                updateSortHeaders();
            }
        });

        // Click Sort Event
        th.addEventListener('click', () => {
            handleSort(colDef.sort);
        });

        theadRow.appendChild(th);
    });

    // Apply current sort style
    updateSortHeaders();

    // Re-enable resizing for new headers
    enableColumnResizing();
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

        // Generate cells based on dynamic column order
        let rowHtml = '';
        columnOrder.forEach((key, index) => {
            const colDef = COLUMNS[key];
            if (!colDef) return;

            const content = colDef.render(project);

            // Dynamic Classes for Body Cells
            let classes = [];
            if (colDef.className) classes.push(colDef.className);
            if (index === 0) classes.push('sticky-col', 'col-0');
            if (index === 1) classes.push('sticky-col', 'col-1');

            const classAttr = classes.length > 0 ? `class="${classes.join(' ')}"` : '';

            // Data-label for mobile view
            const label = `data-label="${colDef.label.split(' / ')[0]}"`; // Simplify label for mobile

            rowHtml += `<td ${classAttr} ${label}>${content}</td>`;
        });

        tr.innerHTML = rowHtml;

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
    // Skip on mobile screens where table might be cards
    if (window.innerWidth <= 768) return;

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
        resizer.setAttribute('draggable', 'false'); // Prevent native drag

        // Prevent sorting when clicking resizer
        resizer.addEventListener('click', (e) => e.stopPropagation());

        col.appendChild(resizer);
        createResizableColumn(col, resizer);
    });
}

function createResizableColumn(col, resizer) {
    let x = 0;
    let w = 0;
    let currentWidth = 0;

    const mouseDownHandler = (e) => {
        e.stopPropagation(); // Stop sort
        x = e.clientX;
        const styles = window.getComputedStyle(col);
        w = parseInt(styles.width, 10);
        currentWidth = w;

        // Disable drag on column header during resize
        if (col) col.setAttribute('draggable', 'false');

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        resizer.classList.add('resizing');
    };

    const mouseMoveHandler = (e) => {
        const dx = e.clientX - x;
        // Allow Shrinking: Only limit is > 10px so it doesn't disappear
        currentWidth = Math.max(10, w + dx);
        col.style.width = `${currentWidth}px`;
        col.style.minWidth = `${currentWidth}px`;
    };

    const mouseUpHandler = () => {
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
        resizer.classList.remove('resizing');

        // Update COLUMNS definition so it persists in memory
        // Update COLUMNS definition so it persists in memory
        const colKey = col.dataset.colKey;
        if (colKey && COLUMNS[colKey]) {
            COLUMNS[colKey].width = currentWidth;
        }

        // Save to localStorage
        saveColumnWidths();

        // Re-enable drag on column header
        if (col) col.setAttribute('draggable', 'true');
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
        .map(key => {
            const val = project.raw[key] || '';
            const highlightedVal = highlightText(val, document.getElementById('searchInput')?.value.trim());
            return `
            <div class="info-grid-item">
                <label>${escapeHtml(key)}</label>
                <p>${highlightedVal}</p>
            </div>
        `;
        }).join('');

    body.innerHTML = `
        <div class="modal-flex-container">
            ${navButtonsTop}
            <div class="modal-header modal-section-header" style="position: relative;">
                <button class="copy-detail-btn" onclick="copyProjectDetail()">
                    <i class="fa-solid fa-copy"></i> 詳細をコピー
                </button>
                ${statusHtml}
                <div style="font-size:0.85rem; color:#94a3b8;">${highlightText(project.id, document.getElementById('searchInput')?.value.trim())} / ${highlightText(project.category, document.getElementById('searchInput')?.value.trim())}</div>
                <h2 class="modal-title">${highlightText(project.title, document.getElementById('searchInput')?.value.trim())}</h2>
            </div>

            <div class="info-grid info-grid-main modal-section-meta">
                ${allColumnsHtml}
            </div>

            <div class="info-item modal-section-skills">
                <label><i class="fa-solid fa-code"></i> 必要スキル</label>
                <div class="modal-description">${highlightText(project.skills, document.getElementById('searchInput')?.value.trim())}</div>
            </div>

            <div class="info-item modal-section-desc">
                <label><i class="fa-solid fa-file-lines"></i> 案件詳細 / 業務内容</label>
                <div class="modal-description">${highlightText(project.description, document.getElementById('searchInput')?.value.trim())}</div>
            </div>
            
            ${navButtonsBottom}
        </div>
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

// Copy Project Title Only
function copyTitleOnly(btn, event) {
    if (event) event.stopPropagation();
    const text = btn.dataset.titleCopy || '';
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        btn.classList.add('success');
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.remove('success');
        }, 1500);
    }).catch(err => {
        console.error('Copy failed', err);
        alert('コピーに失敗しました');
    });
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

    let escaped = escapeHtml(text);

    // Split query into keywords (support multiple space-separated words)
    const keywords = query.trim().split(/\s+/).filter(k => k.length > 0);
    if (keywords.length === 0) return escaped;

    // To avoid nested highlighting or breaking HTML, we use a replacement trick
    // Sort keywords by length descending to match longer strings first
    keywords.sort((a, b) => b.length - a.length);

    keywords.forEach(kw => {
        const escapedKw = escapeHtml(kw);
        const regex = new RegExp(`(${escapedKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        // We only replace if it's not already inside a highlight span
        // Simple heuristic: only replace outside of tags
        // This is still prone to issues with complex HTML, but for our "escaped" text + span, it's safer.
        escaped = escaped.replace(regex, (match) => `<span class="highlight">${match}</span>`);
    });

    return escaped;
}

function setupEventListeners() {
    // Initial resize setup for headers (might need update for dynamic headers or use simple CSS resize)
    // enableColumnResizing(); // Removing legacy resize for now as it conflicts with drag/drop likely

    // Load Favorites
    loadFavorites();

    // Load saved search state
    loadFilterState();

    // Load and Render Columns
    loadColumnOrder();
    loadColumnWidths(); // Apply saved widths
    renderTableHeader();

    const searchInput = document.getElementById('searchInput');

    // Attach event listener to search input
    searchInput.addEventListener('input', () => doFilter());

    // Attach event listener to price filter
    const priceFilter = document.getElementById('priceFilter');
    if (priceFilter) {
        priceFilter.addEventListener('change', doFilter);
    }
    const priceMaxFilter = document.getElementById('priceMaxFilter');
    if (priceMaxFilter) {
        priceMaxFilter.addEventListener('change', doFilter);
    }

    // Attach event listener to favorite filter
    const favoriteFilter = document.getElementById('favoriteFilter');
    if (favoriteFilter) {
        favoriteFilter.addEventListener('change', doFilter);
    }

    // Sort handlers are now attached in renderTableHeader
}

// Global doFilter function
function doFilter() {
    // Save state on change
    saveSearchState();
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

    // Get favorite filter
    const favOnly = document.getElementById('favoriteFilter')?.checked || false;

    // Get price filter
    const minPrice = parseInt(document.getElementById('priceFilter')?.value || '0');
    const maxPrice = parseInt(document.getElementById('priceMaxFilter')?.value || '999');

    // Filter Logic
    const filtered = allProjects.filter(p => {
        // Favorites Match
        if (favOnly && !favorites.has(p.id)) return false;

        // Price Match
        const priceStr = p.price || '';
        const match = priceStr.match(/\d+/);
        const num = match ? parseInt(match[0]) : 0;

        if (minPrice > 0 && num < minPrice) return false;
        if (maxPrice < 999 && num > maxPrice) return false;

        // Text Search - AND logic: all keywords must match
        const searchableText = `${p.id || ''} ${p.title || ''} ${p.skills || ''} ${p.description || ''}`.toLowerCase();
        const textMatch = keywords.length === 0 || keywords.every(kw => searchableText.includes(kw));

        // Category Match (OR logic - if any selected, item must match one of them)
        const catMatch = selectedCats.length === 0 || selectedCats.includes(p.category);

        // Contract Match (OR logic - PARTIAL MATCH: 準委任 matches "準委任契約" etc.)
        const contractMatch = selectedContracts.length === 0 ||
            selectedContracts.some(contract => p.type && p.type.includes(contract));

        return textMatch && catMatch && contractMatch;
    });

    renderProjects(filtered);
    renderTableHeader();

    // Save state after filtering
    saveSearchState();
}

// --- Persistence Logic ---
function saveSearchState() {
    const state = {
        query: document.getElementById('searchInput')?.value || '',
        favOnly: document.getElementById('favoriteFilter')?.checked || false,
        cats: Array.from(document.querySelectorAll('#categoryFilterContainer input:checked')).map(cb => cb.value),
        contracts: Array.from(document.querySelectorAll('#contractFilterContainer input:checked')).map(cb => cb.value),
        minPrice: document.getElementById('priceFilter')?.value || '0',
        maxPrice: document.getElementById('priceMaxFilter')?.value || '999'
    };

    localStorage.setItem('ses_search_state', JSON.stringify(state));
}


function loadFilterState() {
    const stateJson = localStorage.getItem('ses_search_state');
    if (!stateJson) return;

    try {
        const state = JSON.parse(stateJson);

        // Restore Categories
        if (state.cats && Array.isArray(state.cats)) {
            const catInputs = document.querySelectorAll('#categoryFilterContainer input');
            catInputs.forEach(input => {
                input.checked = state.cats.includes(input.value);
            });
        }

        // Restore Contracts
        if (state.contracts && Array.isArray(state.contracts)) {
            const contractInputs = document.querySelectorAll('#contractFilterContainer input');
            contractInputs.forEach(input => {
                input.checked = state.contracts.includes(input.value);
            });
        }

        // Restore Price
        if (state.minPrice) {
            const priceSelect = document.getElementById('priceFilter');
            if (priceSelect) priceSelect.value = state.minPrice;
        }
        if (state.maxPrice) {
            const priceMaxSelect = document.getElementById('priceMaxFilter');
            if (priceMaxSelect) priceMaxSelect.value = state.maxPrice;
        }

        // Restore Favorites Filter
        if (state.favOnly !== undefined) {
            const favCheckbox = document.getElementById('favoriteFilter');
            if (favCheckbox) favCheckbox.checked = state.favOnly;
        }

        // Restore Query
        if (state.query) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = state.query;
        }
    } catch (e) {
        console.error('Failed to load search filter state', e);
    }
}

// --- Favorites Logic ---
function loadFavorites() {
    const saved = localStorage.getItem('ses_favorites');
    if (saved) {
        try {
            favorites = new Set(JSON.parse(saved));
        } catch (e) {
            console.error('Failed to load favorites', e);
        }
    }
}

function saveFavorites() {
    localStorage.setItem('ses_favorites', JSON.stringify(Array.from(favorites)));
}

function toggleFavorite(id, btn, event) {
    if (event) event.stopPropagation();

    if (favorites.has(id)) {
        favorites.delete(id);
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fa-regular fa-star"></i>';
    } else {
        favorites.add(id);
        btn.classList.add('active');
        btn.innerHTML = '<i class="fa-solid fa-star"></i>';
    }

    saveFavorites();
}

function toggleAllFavorites(event) {
    if (event) event.stopPropagation();

    const projects = window.currentFilteredProjects;
    if (!projects || projects.length === 0) return;

    const visibleIds = projects.map(p => p.id);
    const hasAnyFav = visibleIds.some(id => favorites.has(id));

    if (hasAnyFav) {
        // If at least one is favorited, remove favorites from all visible projects
        visibleIds.forEach(id => favorites.delete(id));
    } else {
        // If none are favorited, add all visible projects to favorites
        visibleIds.forEach(id => favorites.add(id));
    }

    saveFavorites();
    renderTableHeader();
    renderProjects(projects);
}

// --- UI Tour Logic (driver.js) ---
function startTour() {
    if (typeof driver === 'undefined' || !driver.js) return;

    const driverObj = driver.js.driver({
        showProgress: true,
        allowClose: true,
        nextBtnText: '次へ',
        prevBtnText: '前へ',
        doneBtnText: '完了',
        steps: [
            {
                element: '.logo',
                popover: {
                    title: 'SES案件DBへようこそ！',
                    description: 'このツアーでは、サイトの使い方を簡単にご説明します。',
                    side: "bottom",
                    align: 'start'
                }
            },
            {
                element: '#searchFilterGroup',
                popover: {
                    title: 'キーワード検索',
                    description: '案件名、スキル、案件番号などで検索できます。<br>スペース区切りで複数指定（AND検索）も可能です。',
                    side: "bottom",
                    align: 'start'
                }
            },
            {
                element: '#categoryFilterGroup',
                popover: {
                    title: '種別フィルター',
                    description: '開発系やインフラなど、案件のカテゴリで絞り込めます。',
                    side: "bottom",
                    align: 'start'
                }
            },
            {
                element: '#contractFilterGroup',
                popover: {
                    title: '契約形態',
                    description: '準委任や派遣などの形態で絞り込めます。',
                    side: "bottom",
                    align: 'start'
                }
            },
            {
                element: '#priceFilterGroup',
                popover: {
                    title: '単価範囲で絞り込む',
                    description: '希望する月額単価の下限と上限を指定して、条件に合う案件だけを表示できます。',
                    side: "bottom",
                    align: 'start'
                }
            },
            {
                element: '.result-count-group',
                popover: {
                    title: '件数とお気に入り',
                    description: 'ヒット件数の確認と、★をつけた「お気に入り案件」だけの表示切り替えができます。',
                    side: "bottom",
                    align: 'end'
                }
            },
            {
                element: '.project-table th:nth-child(2)',
                popover: {
                    title: '並び替えと表の調整',
                    description: '項目名をクリックすると並び替えができます（昇順→降順→解除）。<br>また、ヘッダーをドラッグして列の移動、端をドラッグして幅の調整も可能です。',
                    side: "bottom",
                    align: 'start'
                }
            },
            {
                element: '.copy-title-mini-btn',
                popover: {
                    title: '情報の活用',
                    description: '番号の横にあるこのボタンを押すと、IDと案件名をセットでコピーできます。',
                    side: "top",
                    align: 'start'
                }
            },
            {
                element: '.fav-btn',
                popover: {
                    title: 'お気に入り',
                    description: '星マークを押してお気に入り登録しておくと、後から「★お気に入り」スイッチで簡単に呼び出せます。',
                    side: "top",
                    align: 'start'
                }
            },
            {
                element: '.row-btn-group',
                popover: {
                    title: '詳細',
                    description: '「詳細コピー」で案件詳細全文コピー、「詳細を確認」でカード形式の全体情報の閲覧ができます。',
                    side: "top",
                    align: 'start'
                }
            },
            {
                element: '#headerRight',
                popover: {
                    title: '設定のリセット',
                    description: '表示が崩れたり最初からやり直したい時は「解除」ボタンを押してください。',
                    side: "bottom",
                    align: 'end'
                }
            }
        ]
    });

    driverObj.drive();
    // Mark as shown
    localStorage.setItem('ses_tour_shown', 'true');
}

// Check for first-time user tour
function checkTourAutoStart() {
    const shown = localStorage.getItem('ses_tour_shown');
    if (!shown) {
        // Delay slightly for smooth appearance after data load
        setTimeout(startTour, 1500);
    }
}
