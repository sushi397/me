const portfolioItems = [
    {
        title: "Aurora Analytics Dashboard",
        description: "データ分析の未来を可視化する、直感的で美しいダッシュボードUI。",
        image: "portfolio-1.png",
        link: "#"
    },
    {
        title: "Wanderlust Travel",
        description: "旅への没入感を高める、鮮やかでダイナミックなトラベルサイト。",
        image: "portfolio-2.png",
        link: "#"
    },
    {
        title: "Atelier Vendôme",
        description: "洗練された時を刻む、ラグジュアリーなウォッチブランドのECサイト。",
        image: "portfolio-3.png",
        link: "#"
    }
];

const portfolioGrid = document.getElementById('portfolio-grid');

function renderPortfolio() {
    portfolioItems.forEach((item, index) => {
        const card = document.createElement('article');
        card.className = 'portfolio-item';
        card.style.transitionDelay = `${index * 0.1}s`; // Staggered animation

        card.innerHTML = `
            <a href="${item.link}" class="portfolio__link-wrapper">
                <div class="portfolio__image-wrapper">
                    <img src="${item.image}" alt="${item.title}" class="portfolio__image" loading="lazy">
                </div>
                <div class="portfolio__content">
                    <h3 class="portfolio__title">${item.title}</h3>
                    <p class="portfolio__desc">${item.description}</p>
                    <span class="portfolio__link">View Project <span>&rarr;</span></span>
                </div>
            </a>
        `;

        portfolioGrid.appendChild(card);
    });
}

// Intersection Observer for scroll animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px"
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target); // Animate only once
        }
    });
}, observerOptions);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    renderPortfolio();
    
    // Observe all portfolio items
    const cards = document.querySelectorAll('.portfolio-item');
    cards.forEach(card => observer.observe(card));
});
