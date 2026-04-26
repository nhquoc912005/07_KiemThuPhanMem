const { By } = require('selenium-webdriver');

const config = require('../config');
const { BasePage } = require('./base_page');

class DriverPage extends BasePage {
  async openAssignedTrips() {
    await this.goto('/driver/trips/assigned');
    await this.driver.wait(async () => {
      const url = await this.driver.getCurrentUrl();
      return url.includes('/driver/trips/assigned');
    }, config.defaultTimeoutMs);
  }

  async openTripDetail(routeId) {
    await this.goto(`/driver/trips/${routeId}`);
    await this.visibleTextContains(`CX${String(routeId).padStart(8, '0')}`);
  }

  async startTripIfPending() {
    const buttons = await this.driver.findElements(By.xpath("//button[contains(normalize-space(.), 'Bắt đầu chuyến')]"));
    if (buttons.length > 0 && await buttons[0].isDisplayed().catch(() => false)) {
      await buttons[0].click();
      await this.visibleTextContains('Đã cập nhật trạng thái chuyến');
    }
  }

  async selectFirstStopStatus(statusValue) {
    const changed = await this.driver.executeScript(
      `
        const statusValue = arguments[0];
        const selects = Array.from(document.querySelectorAll('select')).filter((select) => !select.disabled);
        if (!selects.length) return false;
        const select = selects[0];
        select.value = statusValue;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      `,
      statusValue
    );
    if (!changed) {
      throw new Error(`Không tìm thấy select trạng thái khách có thể cập nhật sang ${statusValue}`);
    }
    await this.driver.wait(async () => {
      const body = await this.getBodyText();
      return body.includes('Đã cập nhật') || body.includes(statusValue);
    }, config.defaultTimeoutMs);
  }
}

module.exports = {
  DriverPage
};
