const { By } = require('selenium-webdriver');

const config = require('../config');
const { BasePage } = require('./base_page');

class DispatcherPage extends BasePage {
  async open(route) {
    await this.goto(route);
    await this.driver.wait(async () => {
      const url = await this.driver.getCurrentUrl();
      return url.includes(route);
    }, config.defaultTimeoutMs);
  }

  async logout() {
    const logoutButton = await this.waitVisible(By.css('[title="Đăng xuất"]'));
    await logoutButton.click();
    await this.clickButtonByText('Đăng xuất');
    await this.waitForUrlContains('/login');
  }

  async openCustomers() {
    await this.open('/dispatch/customers');
    await this.waitVisible(By.css('button'));
  }

  async openDrivers() {
    await this.open('/dispatch/drivers');
    await this.waitVisible(By.css('button'));
  }

  async openVehicles() {
    await this.open('/dispatch/vehicles');
    await this.waitVisible(By.css('button'));
  }
}

module.exports = {
  DispatcherPage
};
