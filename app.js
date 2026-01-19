const storageVotesKey = 'bidcars-votes-v1';
        const storageSourcesKey = 'bidcars-sources-v1';

        const $form = $('#search-form');
        const $urlsInput = $('#urls');
        const $maxPagesInput = $('#max-pages');
        const $status = $('#status');
        const $results = $('#results');
        const $loadButton = $('#load-button');
        const $saveSources = $('#save-sources');
        const $useSources = $('#use-sources');
        const $savedSources = $('#saved-sources');

        let votes = loadVotes();
        let savedSources = loadSources();

        renderSavedSources();

        $form.on('submit', async (event) => {
            event.preventDefault();
            const urls = getUrlsFromTextarea();
            if (!urls.length) {
                setStatus('Добавьте хотя бы одну ссылку.');
                return;
            }

            setLoading(true, 'Загрузка...');
            saveSourcesToStore(urls);
            renderSavedSources();

            try {
                const sources = [];
                for (const url of urls) {
                    const resolved = resolveSearchUrl(url);
                    const result = await fetchAllPages(resolved.apiUrl, getMaxPages());
                    result.displayUrl = resolved.displayUrl;
                    result.inputUrl = resolved.inputUrl;
                    sources.push(result);
                }
                renderSources(sources);
                setLoading(false, 'Готово.');
            } catch (error) {
                setLoading(false, 'Ошибка загрузки.');
                $results.html('<div class="error">Не удалось загрузить данные. Проверьте доступ к API и CORS.</div>');
            }
        });

        $saveSources.on('click', () => {
            const urls = getUrlsFromTextarea();
            if (!urls.length) {
                setStatus('Добавьте ссылки для сохранения.');
                return;
            }
            saveSourcesToStore(urls);
            renderSavedSources();
            setStatus('Ссылки сохранены.');
        });

        $useSources.on('click', () => {
            if (!savedSources.length) {
                setStatus('Нет сохраненных ссылок.');
                return;
            }
            $urlsInput.val(savedSources.join('\n'));
            setStatus('Ссылки вставлены.');
        });

        function getUrlsFromTextarea() {
            return $urlsInput.val()
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean);
        }

        function resolveSearchUrl(inputUrl) {
            try {
                const parsed = new URL(inputUrl);
                const host = parsed.hostname.replace(/^www\./, '');
                const path = parsed.pathname;
                const search = parsed.search || '';

                if (host.endsWith('bid.cars') && path.startsWith('/ru/search/results')) {
                    const apiUrl = `https://bid.cars/app/search/request${search}`;
                    return { inputUrl, displayUrl: inputUrl, apiUrl };
                }
            } catch (error) {
                // keep original
            }

            return { inputUrl, displayUrl: inputUrl, apiUrl: inputUrl };
        }

        function getMaxPages() {
            const value = Number($maxPagesInput.val());
            return Number.isFinite(value) && value > 0 ? value : 5;
        }

        function setLoading(isLoading, text) {
            $loadButton.prop('disabled', isLoading);
            setStatus(text);
        }

        function setStatus(text) {
            $status.text(text);
        }

        function renderSources(sources) {
            $results.empty();
            sources.forEach((source, index) => {
                const $section = $('<div>').addClass('source');
                const $header = $(
                    `<div>
                        <h2>Источник ${index + 1}</h2>
                        <div class="badges"></div>
                        <div class="meta">Страниц: ${source.pages || 0}, карточек: ${(source.items || []).length}</div>
                    </div>`
                );
                const $badges = $header.find('.badges');
                const params = extractParamsForBadges(source.displayUrl || source.url || '');
                const badgeList = buildParamBadges(params);
                if (!badgeList.length) {
                    $badges.append($('<span>').addClass('badge').text('Без параметров'));
                } else {
                    badgeList.forEach((label) => {
                        $badges.append($('<span>').addClass('badge').text(label));
                    });
                }
                $section.append($header);

                if (source.errors && source.errors.length) {
                    source.errors.forEach((error) => {
                        const message = error.message || 'Ошибка при загрузке';
                        $section.append($('<div>').addClass('error').text(message));
                    });
                }

                const $cardsWrap = $('<div>').addClass('cards');
                (source.items || []).forEach((item) => {
                    $cardsWrap.append(renderCard(item, source.url));
                });

                $section.append($cardsWrap);
                $results.append($section);
            });
        }

        function renderCard(item, sourceUrl) {
            const meta = extractItemMeta(item, sourceUrl);
            const key = buildItemKey(meta.vin, sourceUrl, meta.id, item);

            const $card = $('<div>').addClass('card').attr('data-key', key);
            $card.toggleClass('is-down', votes[key] === 'down');
            $card.toggleClass('is-up', votes[key] === 'up');

            const fallbackImage = buildPlaceholderSvg(meta.title || 'Авто');
            const imageSrc = meta.image || fallbackImage;
            const $imageWrap = $('<div>').addClass('image-wrap');
            const $image = $('<img>').attr({
                src: imageSrc,
                alt: meta.title || 'Авто',
                loading: 'lazy'
            }).on('error', function () {
                if ($(this).attr('src') !== fallbackImage) {
                    $(this).attr('src', fallbackImage);
                }
            });

            const $badges = $('<div>').addClass('badges');
            if (meta.timeLeft) {
                const $timeBadge = $('<span>').addClass('badge').text(`⏳ ${meta.timeLeft}`);
                if (typeof meta.timeLeftSeconds === 'number') {
                    if (meta.timeLeftSeconds < 5 * 3600) {
                        $timeBadge.addClass('is-red');
                    } else if (meta.timeLeftSeconds < 24 * 3600) {
                        $timeBadge.addClass('is-yellow');
                    } else {
                        $timeBadge.addClass('is-green');
                    }
                }
                $badges.append($timeBadge);
            }
            if (meta.currentBid) {
                $badges.append($('<span>').addClass('badge').text(`💰 ${meta.currentBid}`));
            }

            $imageWrap.append($image);
            if ($badges.children().length) {
                $imageWrap.append($badges);
            }

            const $title = $('<h3>');
            if (meta.link) {
                const $link = $('<a>')
                    .addClass('title-link')
                    .attr({ href: meta.link, target: '_blank', rel: 'noopener noreferrer' })
                    .text(meta.title || 'Без названия');
                $title.append($link);
            } else {
                $title.text(meta.title || 'Без названия');
            }
            if (meta.archiveLink) {
                const $archiveLink = $('<a>')
                    .addClass('archive-link')
                    .attr({ href: meta.archiveLink, target: '_blank', rel: 'noopener noreferrer' })
                    .text('🗂');
                $title.append($archiveLink);
            }

            const $details = $('<div>').addClass('details');
            meta.details.forEach((detail) => {
                $details.append($('<div>').text(detail));
            });
            if (meta.vin) {
                const $vinRow = $('<div>');
                const vinValue = String(meta.vin).toLowerCase();
                const $vinLabel = $('<span>').text('VIN: ');
                const $vinLink = $('<a>')
                    .attr({
                        href: `https://www.mdecoder.com/decode/${encodeURIComponent(vinValue)}`,
                        target: '_blank',
                        rel: 'noopener noreferrer'
                    })
                    .text(meta.vin)
                    .css({ color: '#2563eb' });
                $vinRow.append($vinLabel, $vinLink);
                $details.append($vinRow);
            }

            const $actions = $('<div>').addClass('actions');
            const $upButton = $('<button>').attr('type', 'button').text('👍')
                .toggleClass('is-active', votes[key] === 'up')
                .on('click', () => setVote(key, votes[key] === 'up' ? null : 'up', $card, $upButton, $downButton));

            const $downButton = $('<button>').attr('type', 'button').text('👎')
                .toggleClass('is-active', votes[key] === 'down')
                .on('click', () => setVote(key, votes[key] === 'down' ? null : 'down', $card, $upButton, $downButton));

            $actions.append($upButton, $downButton);

            $card.append($imageWrap, $title, $details, $actions);

            return $card;
        }

        function setVote(key, value, $card, $upButton, $downButton) {
            if (value) {
                votes[key] = value;
            } else {
                delete votes[key];
            }
            saveVotes(votes);
            updateVoteUI(key);
        }

        function updateVoteUI(key) {
            const vote = votes[key];
            const $cards = $(`[data-key=\"${CSS.escape(key)}\"]`);
            $cards.each(function () {
                const $card = $(this);
                $card.toggleClass('is-down', vote === 'down');
                $card.toggleClass('is-up', vote === 'up');
                $card.find('.actions button').eq(0).toggleClass('is-active', vote === 'up');
                $card.find('.actions button').eq(1).toggleClass('is-active', vote === 'down');
            });
        }

        function extractItemMeta(item, sourceUrl) {
            const id = pickFirst(item, ['id', 'lot_id', 'lotId', 'vehicle_id', 'vin']);
            let year = pickFirst(item, ['year', 'vehicle_year']);
            let make = pickFirst(item, ['make', 'vehicle_make', 'brand']);
            let model = pickFirst(item, ['model', 'vehicle_model']);

            const parsed = parseTitleOrTag(item);
            year = parsed.year || year;
            make = parsed.make || make;
            model = parsed.model || model;
            const title = pickFirst(item, ['title', 'name']) || [year, make, model].filter(Boolean).join(' ') || 'Авто';
            const image = pickImage(item);
            const link = buildBidCarsLink(item) || pickFirst(item, ['url', 'link', 'auction_url', 'vehicle_url']);

            const details = [];
            // if (year) details.push(`Год: ${year}`);
            // if (make) details.push(`Марка: ${make}`);
            // if (model) details.push(`Модель: ${model}`);

            const vin = pickFirst(item, ['vin', 'vin_code']);
            const odometer = pickFirst(item, ['odometer', 'mileage', 'odometer_value']);
            if (odometer) details.push(`Пробег: ${odometer}`);

            const auction = pickFirst(item, ['auction', 'auction_name', 'auctionType']);
            if (auction) details.push(`Аукцион: ${auction}`);

            const timeLeftSeconds = extractTimeLeftSeconds(item);
            const timeLeft = formatTimeLeft(item);
            const currentBid = pickFirst(item, ['prebid_price', 'final_bid_formatted', 'final_bid']);
            const archiveLink = buildArchivedSearchLink(year, make, model, sourceUrl);

            return { id, title, image, link, details, vin, timeLeft, timeLeftSeconds, currentBid, archiveLink };
        }

        function buildArchivedSearchLink(year, make, model, sourceUrl) {
            const sourceParams = parseUrlParams(sourceUrl);
            const resolvedMake = make || sourceParams.make;
            const resolvedModel = model || sourceParams.model;

            if (!year || !resolvedMake || !resolvedModel) {
                return null;
            }

            const yearFrom = String(year);
            const yearTo = String(year);

            const params = new URLSearchParams({
                'search-type': sourceParams['search-type'] || 'filters',
                status: sourceParams.status || 'All',
                type: sourceParams.type || 'Automobile',
                make: String(resolvedMake),
                model: String(resolvedModel),
                'year-from': yearFrom,
                'year-to': yearTo,
                'auction-type': sourceParams['auction-type'] || 'All'
            });
            return `https://bid.cars/ru/search/archived/results?${params.toString()}`;
        }

        function parseUrlParams(url) {
            if (!url) return {};
            try {
                const parsed = new URL(url);
                const params = {};
                parsed.searchParams.forEach((value, key) => {
                    params[key] = value;
                });
                return params;
            } catch (error) {
                return {};
            }
        }

        function parseTitleOrTag(item) {
            const result = { year: null, make: null, model: null };

            const name = pickFirst(item, ['name', 'name_long', 'title']);
            if (name && typeof name === 'string') {
                const parts = name.split(',')[0].split(' ');
                if (parts.length >= 3) {
                    result.year = parts[0];
                    result.make = parts[1];
                    result.model = parts[2];
                    return result;
                }
            }

            const tag = pickFirst(item, ['tag']);
            if (tag && typeof tag === 'string') {
                const parts = tag.split('-');
                if (parts.length >= 3) {
                    result.year = parts[0];
                    result.make = parts[1];
                    result.model = parts[2];
                    return result;
                }
            }

            return result;
        }

        function pickFirst(item, keys) {
            for (const key of keys) {
                if (item && item[key] !== undefined && item[key] !== null && item[key] !== '') {
                    return item[key];
                }
            }
            return null;
        }

        function pickImage(item) {
            const direct = pickFirst(item, ['image', 'image_url', 'img_url', 'photo', 'photo_url']);
            if (typeof direct === 'string' && direct) return direct;

            const nestedImage = pickNestedImage(item, ['img_large', 'img']);
            if (nestedImage) return nestedImage;

            if (Array.isArray(item?.images) && item.images.length) {
                const first = item.images[0];
                if (typeof first === 'string') return first;
                if (first?.url) return first.url;
            }

            if (Array.isArray(item?.photos) && item.photos.length) {
                const first = item.photos[0];
                if (typeof first === 'string') return first;
                if (first?.url) return first.url;
            }

            return null;
        }

        function pickNestedImage(item, keys) {
            for (const key of keys) {
                const candidate = item?.[key];
                if (candidate && typeof candidate === 'object') {
                    if (candidate.img_1) return candidate.img_1;
                    const firstKey = Object.keys(candidate)[0];
                    if (firstKey && candidate[firstKey]) return candidate[firstKey];
                }
            }
            return null;
        }

        function buildBidCarsLink(item) {
            const lot = pickFirst(item, ['lot', 'lot_id', 'lotId']);
            const tag = pickFirst(item, ['tag', 'slug']);
            if (lot && tag) {
                return `https://bid.cars/ru/lot/${lot}/${tag}`;
            }
            if (lot) {
                return `https://bid.cars/ru/lot/${lot}`;
            }
            if (tag) {
                return `https://bid.cars/ru/lot/${tag}`;
            }
            return null;
        }

        function buildItemKey(vin, sourceUrl, id, item) {
            if (vin) {
                return `vin::${String(vin).toLowerCase()}`;
            }
            if (id) {
                return `id::${id}`;
            }
            return `hash::${hashString(JSON.stringify(item || {}))}`;
        }

        function hashString(text) {
            let hash = 0;
            for (let i = 0; i < text.length; i++) {
                hash = ((hash << 5) - hash) + text.charCodeAt(i);
                hash |= 0;
            }
            return hash.toString();
        }

        function buildPlaceholderSvg(text) {
            const safeText = sanitizeSvgText(text || 'Авто');
            const svg = `
                <svg xmlns="http://www.w3.org/2000/svg" width="600" height="340">
                    <rect width="100%" height="100%" fill="#e5e7eb"/>
                    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
                        fill="#6b7280" font-family="Arial" font-size="22">${safeText}</text>
                </svg>
            `;
            return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
        }

        function sanitizeSvgText(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .slice(0, 40);
        }

        function formatTimeLeft(item) {
            const seconds = extractTimeLeftSeconds(item);
            if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) {
                const totalMinutes = Math.floor(seconds / 60);
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                return `${hours}:${String(minutes).padStart(2, '0')}`;
            }

            const formatted = pickFirst(item, ['time_left_formatted']);
            if (typeof formatted === 'string' && formatted.trim() !== '') {
                const dayMatch = formatted.match(/(\d+)\s*d/i);
                const hourMatch = formatted.match(/(\d+)\s*h/i);
                const minMatch = formatted.match(/(\d+)\s*min/i);
                const days = dayMatch ? parseInt(dayMatch[1], 10) : 0;
                const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
                const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
                const totalHours = days * 24 + hours;
                return `${totalHours}:${String(minutes).padStart(2, '0')}`;
            }

            return null;
        }

        function extractTimeLeftSeconds(item) {
            const seconds = pickFirst(item, ['time_left']);
            if (typeof seconds === 'number' && Number.isFinite(seconds)) {
                return seconds;
            }
            if (typeof seconds === 'string' && seconds.trim() !== '' && !Number.isNaN(Number(seconds))) {
                return Number(seconds);
            }
            return null;
        }

        function loadVotes() {
            try {
                const stored = localStorage.getItem(storageVotesKey);
                return stored ? JSON.parse(stored) : {};
            } catch (error) {
                return {};
            }
        }

        function saveVotes(data) {
            localStorage.setItem(storageVotesKey, JSON.stringify(data));
        }

        function loadSources() {
            try {
                const stored = localStorage.getItem(storageSourcesKey);
                return stored ? JSON.parse(stored) : [];
            } catch (error) {
                return [];
            }
        }

        function saveSourcesToStore(urls) {
            const normalized = Array.from(new Set(urls));
            const current = new Set(savedSources);
            normalized.forEach((url) => current.add(url));
            savedSources = Array.from(current);
            localStorage.setItem(storageSourcesKey, JSON.stringify(savedSources));
        }

        function removeSource(url) {
            savedSources = savedSources.filter((item) => item !== url);
            localStorage.setItem(storageSourcesKey, JSON.stringify(savedSources));
            renderSavedSources();
        }

        function renderSavedSources() {
            $savedSources.empty();
            if (!savedSources.length) {
                $savedSources.append($('<div>').addClass('status').text('Пока ничего не сохранено.'));
                return;
            }

            savedSources.forEach((url) => {
                const $row = $('<div>').addClass('saved-source');
                const $badges = $('<div>').addClass('badges');
                const params = extractParamsForBadges(url);
                const badgeList = buildParamBadges(params);
                if (!badgeList.length) {
                    $badges.append($('<span>').addClass('badge').text('Без параметров'));
                } else {
                    badgeList.forEach((label) => {
                        $badges.append($('<span>').addClass('badge').text(label));
                    });
                }
                const $actions = $('<div>').addClass('actions');

                const $selectButton = $('<button>').attr('type', 'button').text('Выбрать')
                    .on('click', () => {
                        $urlsInput.val(url);
                    });

                const $addButton = $('<button>').attr('type', 'button').text('+')
                    .on('click', () => {
                        const current = getUrlsFromTextarea();
                        if (!current.includes(url)) {
                            current.push(url);
                            $urlsInput.val(current.join('\n'));
                        }
                    });

                const $removeFromListButton = $('<button>').attr('type', 'button').text('-')
                    .on('click', () => {
                        const current = getUrlsFromTextarea().filter((item) => item !== url);
                        $urlsInput.val(current.join('\n'));
                    });

                const $removeButton = $('<button>').attr('type', 'button').text('Удалить')
                    .on('click', () => removeSource(url));

                $actions.append($selectButton, $addButton, $removeFromListButton, $removeButton);
                $row.append($badges, $actions);
                $savedSources.append($row);
            });
        }

        function extractParamsForBadges(url) {
            try {
                const parsed = new URL(url);
                const params = {};
                parsed.searchParams.forEach((value, key) => {
                    params[key] = value;
                });
                return params;
            } catch (error) {
                return {};
            }
        }

        function buildParamBadges(params) {
            const mapping = [
                ['status', 'Status'],
                ['type', 'Type'],
                ['make', 'Make'],
                ['model', 'Model'],
                ['year-from', 'Year from'],
                ['year-to', 'Year to'],
                ['auction-type', 'Auction'],
                ['search-type', 'Search'],
            ];

            const badges = [];
            mapping.forEach(([key, label]) => {
                if (params[key]) {
                    badges.push(`${label}: ${params[key]}`);
                }
            });

            return badges;
        }

        async function fetchAllPages(url, maxPages) {
            const items = [];
            const errors = [];
            let pagesFetched = 0;
            let nextUrl = url;
            const signatures = [];

            while (nextUrl && pagesFetched < maxPages) {
                pagesFetched += 1;
                const response = await requestJson(nextUrl);
                if (response.error) {
                    errors.push(response.error);
                    break;
                }

                const payload = response.data;
                const pageItems = extractItems(payload);
                items.push(...pageItems);

                const signature = signatureForItems(pageItems);
                if (signature && signatures.includes(signature)) {
                    break;
                }
                if (signature) {
                    signatures.push(signature);
                }

                nextUrl = resolveNextUrl(payload, nextUrl);
                if (!nextUrl || !pageItems.length) {
                    break;
                }
            }

            return { url, items, pages: pagesFetched, errors };
        }

        async function requestJson(url) {
            const proxiedUrl = `proxy.php?url=${encodeURIComponent(url)}`;
            try {
                const response = await fetch(proxiedUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*'
                    }
                });
                if (!response.ok) {
                    return { data: null, error: { message: 'Request failed', status: response.status, url } };
                }
                const json = await response.json();
                if (!json || typeof json !== 'object') {
                    return { data: null, error: { message: 'Response is not JSON', status: response.status, url } };
                }
                return { data: json, error: null };
            } catch (error) {
                return { data: null, error: { message: 'Network error or CORS blocked', url } };
            }
        }

        function extractItems(payload) {
            const paths = [
                'data',
                'data.data',
                'items',
                'items.data',
                'results',
                'results.data',
                'list',
                'listings',
                'vehicles',
                'vehicles.data',
                'response.data',
                'response.items',
                'payload',
                'payload.data',
                'payload.items',
                'payload.results'
            ];

            for (const path of paths) {
                const candidate = getByPath(payload, path);
                if (Array.isArray(candidate) && looksLikeList(candidate)) {
                    return candidate;
                }
            }

            if (Array.isArray(payload) && looksLikeList(payload)) {
                return payload;
            }

            return [];
        }

        function looksLikeList(value) {
            if (Array.isArray(value)) {
                return value.length === 0 || typeof value[0] === 'object';
            }
            return false;
        }

        function resolveNextUrl(payload, currentUrl) {
            const directNext = firstString([
                getByPath(payload, 'next_page_url'),
                getByPath(payload, 'links.next'),
                getByPath(payload, 'links.next_page_url'),
                getByPath(payload, 'meta.next_page_url'),
                getByPath(payload, 'meta.links.next')
            ]);
            if (directNext) return directNext;

            const currentPage = firstInt([
                getByPath(payload, 'current_page'),
                getByPath(payload, 'page'),
                getByPath(payload, 'meta.current_page'),
                getByPath(payload, 'pagination.current_page')
            ]);

            const lastPage = firstInt([
                getByPath(payload, 'last_page'),
                getByPath(payload, 'total_pages'),
                getByPath(payload, 'meta.last_page'),
                getByPath(payload, 'pagination.last_page'),
                getByPath(payload, 'pagination.total_pages')
            ]);

            if (currentPage && lastPage && currentPage < lastPage) {
                return replaceQueryParam(currentUrl, 'page', currentPage + 1);
            }

            const pageParam = extractPageParam(currentUrl);
            if (pageParam !== null) {
                return replaceQueryParam(currentUrl, 'page', pageParam + 1);
            }

            return null;
        }

        function extractPageParam(url) {
            const parsed = new URL(url);
            const page = parsed.searchParams.get('page');
            return page && !Number.isNaN(Number(page)) ? Number(page) : null;
        }

        function replaceQueryParam(url, key, value) {
            const parsed = new URL(url);
            parsed.searchParams.set(key, value);
            return parsed.toString();
        }

        function signatureForItems(items) {
            if (!items.length) return null;
            const sample = items.slice(0, 5);
            return hashString(JSON.stringify(sample));
        }

        function getByPath(obj, path) {
            return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : null), obj);
        }

        function firstString(candidates) {
            for (const candidate of candidates) {
                if (typeof candidate === 'string' && candidate) {
                    return candidate;
                }
            }
            return null;
        }

        function firstInt(candidates) {
            for (const candidate of candidates) {
                if (Number.isInteger(candidate) && candidate > 0) {
                    return candidate;
                }
                if (typeof candidate === 'string' && /^\d+$/.test(candidate)) {
                    return Number(candidate);
                }
            }
            return null;
        }
