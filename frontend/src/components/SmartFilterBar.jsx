export default function SmartFilterBar({
  searchQuery = '',
  onSearchChange = () => {},
  activeFilter = 'all',
  onFilterChange = () => {},
  filterOptions = [
    { id: 'all', label: 'All Items' },
    { id: 'pending', label: 'Pending Handoff' },
    { id: 'transit', label: 'In Transit' },
    { id: 'delivered', label: 'Delivered' },
    { id: 'failed', label: 'Returns Queue' }
  ],
  placeholder = 'Search by tracking #, customer name, phone, or address...'
}) {
  return (
    <div className="filter-bar-wrap">
      <div className="search-input-wrap">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="form-input search-input-field"
          placeholder={placeholder}
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>
      <div className="filter-pills-row">
        {filterOptions.map(opt => (
          <button
            key={opt.id}
            className={`filter-pill ${activeFilter === opt.id ? 'active' : ''}`}
            onClick={() => onFilterChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
